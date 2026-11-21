from flask import Flask, request, jsonify
from flask_cors import CORS
import collections
import hmac
import json
import mysql.connector
import os
import logging
import re
import shutil
import tempfile
import threading
from werkzeug.exceptions import HTTPException
from pydub import AudioSegment
import speech_recognition as sr

import servico_admin
from tradutor import Tradutor, chave, normalizar_sinal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api_tradu")

def carregar_env_local():
    """Lê o .env da raiz do projeto (rodando fora do Docker). Variáveis já definidas no
    ambiente têm prioridade, então no Docker/produção nada muda."""
    caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(caminho):
        return
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                nome, valor = linha.split("=", 1)
                os.environ.setdefault(nome.strip(), valor.strip().strip('"').strip("'"))

carregar_env_local()

# Limites de entrada
LIMITE_TEXTO = 300                      # caracteres por tradução
LIMITE_UPLOAD_BYTES = 5 * 1024 * 1024   # áudio de até 5 MB
LIMITE_EXCLUSOES = 200                  # sinais ocultados pelo usuário enviados por tradução
LIMITE_SOLETRAR = 20                    # palavras que a pessoa pediu para soletrar, por tradução
EXTENSOES_AUDIO = {"webm", "ogg", "m4a", "mp4", "mp3", "wav", "aac"}

# Limite de tokens do plano: o servidor Node (que sabe quem é o usuário e qual o plano dele) envia o
# limite no cabeçalho X-Limite-Palavras. Token = palavra: "Eu gosto de café" = 4; pontuação não conta
# e "guarda-chuva" conta como uma. Sem o cabeçalho, não há limite (planos Enterprise e Customized).
PALAVRA = re.compile(r"\w+(?:[-'’]\w+)*")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = LIMITE_UPLOAD_BYTES
app.json.ensure_ascii = False
CORS(app)

# Motor de tradução (tradutor.py): carrega os sinais do banco, o spaCy e os dicionários.
# Configuração por variáveis de ambiente: MODELO_SPACY, MODELO_EMBEDDING, LIMIAR_SEMANTICO,
# DATILOLOGIA, CACHE_TTL_SEGUNDOS e DB_* (veja .env.example).
log.info("[tradutor] Carregando sinais e modelos...")
motor = Tradutor.criar_do_ambiente()

def connect_to_db():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "db"),
        user=os.getenv("DB_USER", "tradulibras"),
        password=os.getenv("DB_PASS", ""),
        database=os.getenv("DB_NAME", "app_tradu_embedding")
    )

# ----------------- Palavras sem sinal -----------------
# Cada palavra que ficou sem sinal é contada na tabela termos_sem_sinal (sql/termos_sem_sinal.sql).
# A lista ordenada por ocorrências mostra quais sinais vale a pena gravar primeiro.
# As contagens ficam em memória e são gravadas a cada minuto, para não abrir conexão a cada tradução.
REGISTRAR_SEM_SINAL = os.getenv("REGISTRAR_SEM_SINAL", "1").lower() not in ("0", "false", "nao", "não")
_sem_sinal = collections.Counter()
_sem_sinal_lock = threading.Lock()

def anotar_sem_sinal(termos):
    if not REGISTRAR_SEM_SINAL or not termos:
        return
    with _sem_sinal_lock:
        for t in termos:
            t = normalizar_sinal(t)[:100]
            if t:
                _sem_sinal[t] += 1

def gravar_sem_sinal():
    with _sem_sinal_lock:
        pendentes = dict(_sem_sinal)
        _sem_sinal.clear()
    if not pendentes:
        return
    try:
        db = connect_to_db()
        try:
            cur = db.cursor()
            cur.executemany("""
                INSERT INTO termos_sem_sinal (termo, ocorrencias) VALUES (%s, %s) AS novo
                ON DUPLICATE KEY UPDATE ocorrencias = termos_sem_sinal.ocorrencias + novo.ocorrencias
            """, list(pendentes.items()))
            db.commit()
        finally:
            db.close()
    except Exception:
        log.warning("[sem_sinal] não foi possível gravar %d termos", len(pendentes), exc_info=True)

def _gravar_periodicamente():
    parar = threading.Event()
    while not parar.wait(60):
        gravar_sem_sinal()

if REGISTRAR_SEM_SINAL:
    threading.Thread(target=_gravar_periodicamente, daemon=True).start()

def traduzir(texto, exclusoes=frozenset(), soletrar=frozenset()):
    # O site sempre pergunta antes de soletrar: só as palavras de `soletrar` viram letras.
    # As outras sem sinal voltam em `soletraveis` (ver resposta_traducao).
    resultado = motor.traduzir(texto, exclusoes, soletrar)
    anotar_sem_sinal(resultado.get("sem_sinal"))
    return resultado

# ----------------- Áudio -----------------
class AudioIncompreensivel(Exception):
    """O áudio foi lido, mas nenhuma fala foi reconhecida."""

class TranscricaoIndisponivel(Exception):
    """O serviço externo de transcrição (Google) falhou ou está fora do ar."""

def transcrever_audio_caminho(file_path):
    r = sr.Recognizer()
    with sr.AudioFile(file_path) as source:
        audio = r.record(source)
    try:
        return r.recognize_google(audio, language='pt-BR')
    except sr.UnknownValueError as e:
        raise AudioIncompreensivel() from e
    except sr.RequestError as e:
        raise TranscricaoIndisponivel(str(e)) from e

# ----------------- Padrão de respostas da API -----------------
# Sucesso:  {"status": "success", "frase_original", "glosa", "sequencia", "sem_sinal", "soletraveis",
#            ["texto_transcrito"]}
#           cada item da sequência: {termo_original, expressao_libras, url, score, metodo, aproximado}
#           metodo: exato | sinonimo | lema | variacao | correcao | semelhanca | datilologia
#           soletraveis: palavras de sem_sinal que podem ser soletradas; o site pergunta e, se a pessoa
#           escolher soletrar, traduz de novo com {"soletrar": [...]}
# Sem sinal: 404 {"status": "not_found", "codigo": "SEM_SINAIS", "mensagem", "frase_original", "glosa",
#                 "sem_sinal", "soletraveis", "sugestao_link"}
# Erro:     {"status": "error", "codigo", "mensagem"}  (nunca expõe detalhes internos)

def erro(status_http, codigo, mensagem):
    return jsonify({'status': 'error', 'codigo': codigo, 'mensagem': mensagem}), status_http

def resposta_traducao(resultado, **extra):
    corpo = {
        'frase_original': resultado['frase_original'],
        'glosa': resultado['glosa_gerada'],
        'sem_sinal': resultado.get('sem_sinal', []),
        'soletraveis': resultado.get('soletraveis', []),
        **extra,
    }
    if resultado['traducao_encontrada']:
        return jsonify({'status': 'success', 'sequencia': resultado['sequencia'], **corpo}), 200
    return jsonify({
        'status': 'not_found',
        'codigo': 'SEM_SINAIS',
        'mensagem': 'Ainda não temos sinais para essa frase.',
        'sugestao_link': '/sugestoes',
        'sequencia': [],
        **corpo,
    }), 404

def ler_texto(valor):
    """Valida o texto a traduzir: string não vazia de até LIMITE_TEXTO caracteres."""
    if not isinstance(valor, str):
        return None
    texto = " ".join(valor.split())
    return texto if 0 < len(texto) <= LIMITE_TEXTO else None

def ler_exclusoes(valor):
    """
    Sinais que o usuário marcou como incorretos: [{"termo": "...", "expressao": "..."}].
    Vêm do navegador (do banco, para quem está logado; da sessão do navegador, para visitantes)
    e só afetam a tradução de quem enviou. Aceita lista ou texto JSON (envio por formulário).
    """
    if isinstance(valor, str):
        try:
            valor = json.loads(valor)
        except ValueError:
            return frozenset()
    if not isinstance(valor, list):
        return frozenset()

    exclusoes = set()
    for item in valor[:LIMITE_EXCLUSOES]:
        if not isinstance(item, dict):
            continue
        termo, expressao = item.get('termo'), item.get('expressao')
        if isinstance(termo, str) and isinstance(expressao, str):
            termo, expressao = normalizar_sinal(termo)[:100], normalizar_sinal(expressao)[:100]
            if termo and expressao:
                exclusoes.add((termo, expressao))
    return frozenset(exclusoes)

def ler_soletrar(valor):
    """Palavras sem sinal que a pessoa escolheu soletrar (lista de textos), como chaves de busca."""
    if not isinstance(valor, list):
        return frozenset()
    palavras = (chave(p)[:40] for p in valor[:LIMITE_SOLETRAR] if isinstance(p, str))
    return frozenset(p for p in palavras if p)

def contar_palavras(texto):
    return len(PALAVRA.findall(texto or ''))

def ler_limite_palavras():
    """Limite do plano enviado pelo Node (inteiro > 0) ou None, que significa sem limite."""
    valor = request.headers.get('X-Limite-Palavras', '').strip()
    return int(valor) if valor.isdigit() and int(valor) > 0 else None

def erro_limite_plano(texto, limite, **extra):
    """Resposta quando o texto passa do limite de tokens do plano (None se estiver dentro)."""
    palavras = contar_palavras(texto)
    if limite is None or palavras <= limite:
        return None
    return jsonify({
        'status': 'error',
        'codigo': 'LIMITE_PLANO',
        'mensagem': f'Seu plano traduz até {limite} tokens (palavras) por vez, e o texto tem {palavras}.',
        'limite': limite,
        'palavras': palavras,
        'planos_link': '/planos',
        **extra,
    }), 413

@app.errorhandler(HTTPException)
def erro_http(e):
    codigos = {404: 'ROTA_INEXISTENTE', 405: 'METODO_NAO_PERMITIDO', 413: 'ARQUIVO_GRANDE'}
    mensagens = {413: 'O áudio é grande demais (máximo de 5 MB).'}
    return erro(e.code, codigos.get(e.code, 'ERRO_HTTP'), mensagens.get(e.code, e.description))

@app.errorhandler(Exception)
def erro_inesperado(e):
    log.exception("Erro inesperado em %s", request.path)
    return erro(500, 'ERRO_INTERNO', 'Erro interno no processamento.')

# ----------------- Rota de Tradução de Frases/Texto -----------------
# A tradução (texto e voz) é interna: o navegador chama o Node (POST /traduzir e /traduzir/voz), que
# confere o plano do usuário e repassa para cá com X-Token-Interno e X-Limite-Palavras. Assim o limite
# do plano não pode ser contornado chamando a API direto. As antigas /api/sugestao e /api/transcrever
# eram públicas e foram removidas.
@app.route('/interno/traduzir', methods=['POST'])
def interno_traduzir():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return erro(400, 'JSON_INVALIDO', 'Envie um JSON no formato {"texto": "..."}.')

    texto = ler_texto(data.get('texto'))
    if texto is None:
        return erro(400, 'TEXTO_INVALIDO', f'Digite um texto de 1 a {LIMITE_TEXTO} caracteres.')

    excedeu = erro_limite_plano(texto, ler_limite_palavras())
    if excedeu:
        return excedeu

    return resposta_traducao(traduzir(texto, ler_exclusoes(data.get('exclusoes')),
                                      ler_soletrar(data.get('soletrar'))))

# ----------------- Glossário (palavras com sinal cadastrado) -----------------
@app.route('/api/glossario', methods=['GET'])
def glossario():
    lista = motor.indice.glossario()
    return jsonify({'status': 'success', 'total': len(lista), 'palavras': lista}), 200

# ----------------- Feedback -----------------
# O feedback agora é salvo pelo servidor Node (POST /feedback), que sabe quem é o usuário logado
# (tabelas feedback_traducao e exclusoes_usuario). A antiga rota /api/feedback gravava votos sem dono
# e, após 3 votos negativos de qualquer pessoa, excluía o sinal para todos; por isso foi removida.
# Aqui a API só aplica as exclusões que chegam junto com cada tradução (ver ler_exclusoes).

# ----------------- Rota de Áudio ajustada para Frases -----------------
@app.route('/interno/transcrever', methods=['POST'])
def interno_transcrever():
    f = request.files.get('file')
    if f is None or not f.filename:
        return erro(400, 'ARQUIVO_AUSENTE', 'Nenhum arquivo de áudio enviado.')

    extensao = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if extensao not in EXTENSOES_AUDIO:
        extensao = 'webm'

    tmp_dir = tempfile.mkdtemp(prefix='uploads_')
    input_path = os.path.join(tmp_dir, 'entrada.' + extensao)
    output_path = os.path.join(tmp_dir, 'converted.wav')

    try:
        f.save(input_path)
        try:
            AudioSegment.from_file(input_path).export(output_path, format='wav')
        except Exception:
            log.warning("Áudio inválido recebido", exc_info=True)
            return erro(400, 'AUDIO_INVALIDO', 'Não foi possível ler o arquivo de áudio.')

        try:
            texto = transcrever_audio_caminho(output_path)
        except AudioIncompreensivel:
            return erro(422, 'AUDIO_INCOMPREENSIVEL', 'Não conseguimos entender o áudio. Fale mais perto do microfone e tente de novo.')
        except TranscricaoIndisponivel:
            log.warning("Serviço de transcrição indisponível", exc_info=True)
            return erro(502, 'TRANSCRICAO_INDISPONIVEL', 'O serviço de transcrição está indisponível no momento.')

        texto = ler_texto(texto) or texto[:LIMITE_TEXTO]
        # O limite vale para o que foi falado: a resposta traz a transcrição para a pessoa ver o que passou
        excedeu = erro_limite_plano(texto, ler_limite_palavras(), texto_transcrito=texto)
        if excedeu:
            return excedeu
        exclusoes = ler_exclusoes(request.form.get('exclusoes'))
        return resposta_traducao(traduzir(texto, exclusoes), texto_transcrito=texto)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

# ----------------- Rotas internas (área de administração do site) -----------------
# Chamadas só pelo servidor Node, com o cabeçalho X-Token-Interno igual a TOKEN_INTERNO do .env.
# Ficam fora de /api (o proxy de produção só repassa /api) e, sem TOKEN_INTERNO, ficam desligadas.
TOKEN_INTERNO = os.getenv("TOKEN_INTERNO", "")
LIMITE_EMBEDDINGS = 1000

@app.before_request
def proteger_rotas_internas():
    if not request.path.startswith('/interno/'):
        return None
    enviado = request.headers.get('X-Token-Interno', '')
    if not TOKEN_INTERNO or not hmac.compare_digest(enviado.encode(), TOKEN_INTERNO.encode()):
        return erro(403, 'ACESSO_NEGADO', 'Acesso negado.')
    return None

@app.route('/interno/status', methods=['GET'])
def interno_status():
    return jsonify({'status': 'success', **motor.status(),
                    'modelo_embedding_carregado': servico_admin.modelo_embedding_carregado(),
                    'buckets': servico_admin.buckets_configurados()}), 200

@app.route('/interno/recarregar', methods=['POST'])
def interno_recarregar():
    motor.pedir_recarga()
    return jsonify({'status': 'success', 'mensagem': 'Recarga dos sinais iniciada.'}), 202

@app.route('/interno/embeddings', methods=['POST'])
def interno_embeddings():
    data = request.get_json(silent=True) or {}
    textos = data.get('textos')
    if (not isinstance(textos, list) or not textos or len(textos) > LIMITE_EMBEDDINGS
            or not all(isinstance(t, str) and 0 < len(t.strip()) <= 100 for t in textos)):
        return erro(400, 'TEXTOS_INVALIDOS', f'Envie de 1 a {LIMITE_EMBEDDINGS} textos de até 100 caracteres.')
    return jsonify({'status': 'success', 'vetores': servico_admin.gerar_embeddings([t.strip() for t in textos])}), 200

@app.route('/interno/descricoes', methods=['POST'])
def interno_descricoes():
    """Sugestão de descrição (com acento) para nomes de arquivo: "aviao_de_papel.mp4" -> "avião de papel"."""
    data = request.get_json(silent=True) or {}
    nomes = data.get('nomes')
    if not isinstance(nomes, list) or len(nomes) > LIMITE_EMBEDDINGS or not all(isinstance(n, str) for n in nomes):
        return erro(400, 'NOMES_INVALIDOS', 'Envie uma lista de nomes de arquivo.')
    return jsonify({'status': 'success', 'descricoes': [servico_admin.sugerir_descricao(n[:500]) for n in nomes]}), 200

@app.route('/interno/s3/videos', methods=['GET'])
def interno_s3_videos():
    try:
        resultado = servico_admin.listar_videos_s3()
    except Exception as e:
        # Sem credenciais, sem permissão, bucket inexistente...: a mensagem ajuda quem configura o servidor
        log.warning("Falha ao listar o S3", exc_info=True)
        nome = type(e).__name__
        if nome in ('NoCredentialsError', 'PartialCredentialsError'):
            return erro(503, 'S3_SEM_CREDENCIAIS', 'A API não tem credenciais da AWS configuradas para ler o S3.')
        if nome == 'ClientError':
            codigo = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
            return erro(502, 'S3_ERRO', f'O S3 recusou a listagem ({codigo or "erro desconhecido"}). Confira as permissões e os buckets.')
        return erro(502, 'S3_ERRO', 'Não foi possível listar os vídeos do S3.')
    return jsonify({'status': 'success', **resultado}), 200

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=int(os.getenv("API_PORT", "5000")), debug=False, threaded=True)
