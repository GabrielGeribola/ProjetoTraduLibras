from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import numpy as np
import json
from sklearn.metrics.pairwise import cosine_similarity
from Levenshtein import distance as levenshtein_distance
import spacy
from sentence_transformers import SentenceTransformer
import os
import logging
import shutil
import tempfile
import threading
import time
from werkzeug.exceptions import HTTPException
from pydub import AudioSegment
import speech_recognition as sr

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("api_tradu")

# Limites de entrada
LIMITE_TEXTO = 300                      # caracteres por tradução
LIMITE_UPLOAD_BYTES = 5 * 1024 * 1024   # áudio de até 5 MB
LIMITE_EXCLUSOES = 200                  # sinais ocultados pelo usuário enviados por tradução
EXTENSOES_AUDIO = {"webm", "ogg", "m4a", "mp4", "mp3", "wav", "aac"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = LIMITE_UPLOAD_BYTES
app.json.ensure_ascii = False
CORS(app)

# Carregar modelo spaCy para português (Análise Sintática / POS Tagging)
# Certifique-se de rodar: python -m spacy download pt_core_news_sm
try:
    nlp = spacy.load("pt_core_news_sm")
except OSError:
    import os
    os.system("python -m spacy download pt_core_news_sm")
    nlp = spacy.load("pt_core_news_sm")

model = SentenceTransformer('paraphrase-MiniLM-L6-v2')

def connect_to_db():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "db"),
        user=os.getenv("DB_USER", "tradulibras"),
        password=os.getenv("DB_PASS", "Tradulibras2024"),
        database=os.getenv("DB_NAME", "app_tradu_embedding")
    )

# ----------------- Cache dos sinais em memória -----------------
# A tabela words_sl_br tem ~8.600 sinais com embeddings (~66 MB em JSON).
# Baixar isso do banco a cada tradução levava 20s ou mais, então carregamos uma vez
# e atualizamos em segundo plano a cada CACHE_TTL_SEGUNDOS (padrão: 1 hora).
CACHE_TTL_SEGUNDOS = int(os.getenv("CACHE_TTL_SEGUNDOS", "3600"))

_cache_sinais = None  # (expressions, embeddings, urls_por_expressao, carregado_em)
_cache_lock = threading.Lock()
_cache_atualizando = threading.Event()

def carregar_cache_sinais():
    global _cache_sinais
    inicio = time.time()
    db = connect_to_db()
    cursor = db.cursor()
    try:
        expressions, embeddings = get_expressions_and_embeddings(cursor)
        cursor.execute("""
            SELECT w.description, a.url
            FROM words_sl_br w
            JOIN animation_sl_br a ON w.id_animation = a.id_animation
        """)
        urls = {}
        for descricao, url in cursor.fetchall():
            urls.setdefault(descricao, url)  # mantém o primeiro, como o antigo "LIMIT 1"
    finally:
        cursor.close()
        db.close()

    _cache_sinais = (expressions, embeddings, urls, time.time())
    log.info("[cache] %d sinais carregados em %.1fs", len(expressions), time.time() - inicio)

def _atualizar_cache_em_segundo_plano():
    try:
        carregar_cache_sinais()
    except Exception:
        log.exception("[cache] Erro ao atualizar, mantendo os dados atuais")
    finally:
        _cache_atualizando.clear()

def obter_cache_sinais():
    # Primeira carga: bloqueia (só acontece se a API não carregou na inicialização)
    if _cache_sinais is None:
        with _cache_lock:
            if _cache_sinais is None:
                carregar_cache_sinais()

    expressions, embeddings, urls, carregado_em = _cache_sinais

    # Cache vencido: atualiza em segundo plano e continua respondendo com os dados atuais
    if time.time() - carregado_em > CACHE_TTL_SEGUNDOS and not _cache_atualizando.is_set():
        _cache_atualizando.set()
        threading.Thread(target=_atualizar_cache_em_segundo_plano, daemon=True).start()

    return expressions, embeddings, urls

def gerar_embeddings(texto):
    tokens = texto.split()
    if not tokens:
        return np.zeros(384) # Dimensão do MiniLM-L6-v2
    vetores = [model.encode(token) for token in tokens]
    return np.mean(vetores, axis=0)

def get_expressions_and_embeddings(cursor):
    cursor.execute("SELECT description, JSON_EXTRACT(embedding, '$') FROM words_sl_br")
    data = cursor.fetchall()
    expressions = [row[0] for row in data]
    embeddings = [np.array(json.loads(row[1])) for row in data]
    return expressions, np.array(embeddings)

def portugues_para_glosa_libras(frase_portugues):
    """
    Converte a frase em português para a estrutura gramatical aproximada de Libras (Glosa).
    Remove artigos, preposições vazias e reorganiza elementos (ex: Tópico/Tempo + Objeto + Verbo).
    """
    doc = nlp(frase_portugues.lower())
    
    tempos = []
    sujeitos = []
    objetos = []
    verbos = []
    outros = []

    for token in doc:
        # Ignorar pontuações, determinantes (artigos) e preposições puras de ligação
        if token.pos_ in ["PUNCT", "DET"] or token.dep_ == "case":
            continue
            
        lema = token.lemma_
        
        if token.dep_ in ["nsubj", "nsubj:pass"]:
            sujeitos.append(lema)
        elif token.dep_ in ["obj", "iobj", "obl"]:
            objetos.append(lema)
        elif token.pos_ == "VERB":
            verbos.append(lema)
        elif token.dep_ in ["advmod"] and ("ontem" in lema or "amanhã" in lema or "hoje" in lema):
            tempos.append(lema)
        else:
            outros.append(lema)

    # Ordem básica aproximada em Libras: [Tempo] + [Objeto/Tópico] + [Sujeito] + [Verbo]
    glosa_tokens = tempos + objetos + sujeitos + outros + verbos
    return " ".join([t for t in glosa_tokens if t])

def normalizar_sinal(texto):
    """Forma usada para comparar sinais: minúsculo e sem espaços repetidos."""
    return " ".join(texto.split()).lower()

def encontrar_melhor_sinal(termo, expressions, embeddings, ocultos=frozenset()):
    """
    Busca o melhor match no banco para um termo isolado da glosa.
    `ocultos`: sinais que ESTE usuário marcou como incorretos para o termo; são pulados
    e o próximo melhor candidato é usado no lugar.
    """
    if not expressions or len(embeddings) == 0:
        return None, 0.0

    def permitido(indice):
        return not ocultos or normalizar_sinal(expressions[indice]) not in ocultos

    # Tenta match por embedding (do mais parecido para o menos parecido)
    embedding_termo = model.encode(termo)
    similarity_scores = cosine_similarity([embedding_termo], embeddings)[0]
    for indice in np.argsort(-similarity_scores):
        score = similarity_scores[indice]
        if score < 0.7:
            break
        if permitido(indice):
            return expressions[indice], float(score)

    # Fallback Levenshtein para o termo
    distancias = np.array([levenshtein_distance(termo, expr.lower()) for expr in expressions])
    for indice in np.argsort(distancias, kind='stable'):
        if distancias[indice] > 2:
            break
        if permitido(indice):
            return expressions[indice], 0.0

    return None, 0.0

def processar_traducao_frase(frase_usuario, exclusoes=frozenset()):
    expressions, embeddings, urls = obter_cache_sinais()

    # 1. Converter frase em estrutura de Libras (Glosa)
    glosa = portugues_para_glosa_libras(frase_usuario)
    termos_glosa = glosa.split()

    sequencia_animacoes = []

    # 2. Mapear cada termo da glosa para um sinal cadastrado no banco
    for termo in termos_glosa:
        ocultos = frozenset(sinal for (t, sinal) in exclusoes if t == normalizar_sinal(termo))
        sinal_encontrado, score = encontrar_melhor_sinal(termo, expressions, embeddings, ocultos)
        if sinal_encontrado:
            url = urls.get(sinal_encontrado)
            if url:
                sequencia_animacoes.append({
                    'termo_original': termo,
                    'expressao_libras': sinal_encontrado,
                    'url': url,
                    'score': score
                })

    return {
        'frase_original': frase_usuario,
        'glosa_gerada': glosa,
        'traducao_encontrada': len(sequencia_animacoes) > 0,
        'sequencia': sequencia_animacoes
    }

def find_animation_url(cursor, expression):
    cursor.execute("""
        SELECT a.url
        FROM words_sl_br w
        JOIN animation_sl_br a ON w.id_animation = a.id_animation
        WHERE w.description = %s
        LIMIT 1
    """, (expression,))
    result = cursor.fetchone()
    return result[0] if result else None

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
# Sucesso:  {"status": "success", "frase_original", "glosa", "sequencia", ["texto_transcrito"]}
# Sem sinal: 404 {"status": "not_found", "codigo": "SEM_SINAIS", "mensagem", "frase_original", "glosa", "sugestao_link"}
# Erro:     {"status": "error", "codigo", "mensagem"}  (nunca expõe detalhes internos)

def erro(status_http, codigo, mensagem):
    return jsonify({'status': 'error', 'codigo': codigo, 'mensagem': mensagem}), status_http

def resposta_traducao(resultado, **extra):
    corpo = {
        'frase_original': resultado['frase_original'],
        'glosa': resultado['glosa_gerada'],
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
@app.route('/api/sugestao', methods=['POST'])
def sugestao():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return erro(400, 'JSON_INVALIDO', 'Envie um JSON no formato {"texto": "..."}.')

    texto = ler_texto(data.get('texto'))
    if texto is None:
        return erro(400, 'TEXTO_INVALIDO', f'Digite um texto de 1 a {LIMITE_TEXTO} caracteres.')

    return resposta_traducao(processar_traducao_frase(texto, ler_exclusoes(data.get('exclusoes'))))

# ----------------- Glossário (palavras com sinal cadastrado) -----------------
@app.route('/api/glossario', methods=['GET'])
def glossario():
    expressions, _, urls = obter_cache_sinais()
    palavras = {}
    for expr in expressions:
        rotulo = " ".join(expr.split())
        # Algumas descrições no banco são nomes de arquivo (ex.: "casa.mp4"): não exibe no glossário
        if rotulo.lower().endswith(('.mp4', '.webm', '.gif', '.mov')):
            continue
        if rotulo and expr in urls:
            palavras.setdefault(rotulo.lower(), rotulo)  # sem repetição, ignorando maiúsculas/espaços
    lista = sorted(palavras.values(), key=str.lower)
    return jsonify({'status': 'success', 'total': len(lista), 'palavras': lista}), 200

# ----------------- Feedback -----------------
# O feedback agora é salvo pelo servidor Node (POST /feedback), que sabe quem é o usuário logado
# (tabelas feedback_traducao e exclusoes_usuario). A antiga rota /api/feedback gravava votos sem dono
# e, após 3 votos negativos de qualquer pessoa, excluía o sinal para todos; por isso foi removida.
# Aqui a API só aplica as exclusões que chegam junto com cada tradução (ver ler_exclusoes).

# ----------------- Rota de Áudio ajustada para Frases -----------------
@app.route('/api/transcrever', methods=['POST'])
def transcrever():
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
        exclusoes = ler_exclusoes(request.form.get('exclusoes'))
        return resposta_traducao(processar_traducao_frase(texto, exclusoes), texto_transcrito=texto)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == '__main__':
    # Carrega os sinais antes de aceitar requisições, para a primeira tradução já ser rápida
    log.info("[cache] Carregando sinais do banco (pode levar ~30s)...")
    carregar_cache_sinais()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
