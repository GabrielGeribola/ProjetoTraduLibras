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
import tempfile
import threading
import time
from werkzeug.utils import secure_filename
from pydub import AudioSegment
import speech_recognition as sr

app = Flask(__name__)
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
    print(f"[cache] {len(expressions)} sinais carregados em {time.time() - inicio:.1f}s")

def _atualizar_cache_em_segundo_plano():
    try:
        carregar_cache_sinais()
    except Exception as e:
        print("[cache] Erro ao atualizar, mantendo os dados atuais:", e)
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

def encontrar_melhor_sinal(termo, expressions, embeddings):
    """Busca o melhor match no banco para um termo isolado da glosa."""
    if not expressions or len(embeddings) == 0:
        return None, 0.0

    # Tenta match exato/embedding
    embedding_termo = model.encode(termo)
    similarity_scores = cosine_similarity([embedding_termo], embeddings)
    max_score_index = np.argmax(similarity_scores)
    score = similarity_scores[0][max_score_index]
    
    if score >= 0.7:
        return expressions[max_score_index], float(score)
        
    # Fallback Levenshtein para o termo
    distancias = [levenshtein_distance(termo, expr.lower()) for expr in expressions]
    min_idx = np.argmin(distancias)
    if distancias[min_idx] <= 2:
        return expressions[min_idx], 0.0

    return None, 0.0

def processar_traducao_frase(frase_usuario):
    expressions, embeddings, urls = obter_cache_sinais()

    # 1. Converter frase em estrutura de Libras (Glosa)
    glosa = portugues_para_glosa_libras(frase_usuario)
    termos_glosa = glosa.split()
    
    sequencia_animacoes = []
    
    # 2. Mapear cada termo da glosa para um sinal cadastrado no banco
    for termo in termos_glosa:
        sinal_encontrado, score = encontrar_melhor_sinal(termo, expressions, embeddings)
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

def transcrever_audio_caminho(file_path):
    r = sr.Recognizer()
    try:
        with sr.AudioFile(file_path) as source:
            audio = r.record(source)
        return r.recognize_google(audio, language='pt-BR')
    except Exception as e:
        print("Erro na transcrição:", e)
        return None

# ----------------- Rota de Tradução de Frases/Texto -----------------
@app.route('/api/sugestao', methods=['POST'])
def sugestao():
    data = request.get_json()
    user_input = data.get('texto')
    
    if not user_input:
        return jsonify({'mensagem': 'Nenhum texto fornecido.', 'status': 'error'}), 400

    try:
        resultado = processar_traducao_frase(user_input)

        if resultado['traducao_encontrada']:
            return jsonify({
                'status': 'success',
                'frase_original': resultado['frase_original'],
                'glosa': resultado['glosa_gerada'],
                'sequencia': resultado['sequencia']
            }), 200
        else:
            return jsonify({
                'mensagem': 'Não foi possível montar a sentença em Libras com os sinais disponíveis.',
                'status': 'not_found',
                'sugestao_link': '/sugestoes'
            }), 404
            
    except Exception as e:
        return jsonify({'erro': str(e), 'mensagem': 'Erro interno no processamento.', 'status': 'error'}), 500

# ----------------- Feedback -----------------
def registrar_feedback(cursor, entrada, sugestao, score, foi_util):
    cursor.execute("""
        INSERT INTO feedback_log (input_text, expressao_sugerida, score, foi_util)
        VALUES (%s, %s, %s, %s)
    """, (entrada, sugestao, float(score), foi_util))

    # Após 3 rejeições da mesma sugestão para a mesma entrada, ela é marcada como exclusão
    cursor.execute("""
        SELECT COUNT(*) FROM feedback_log
        WHERE input_text = %s AND expressao_sugerida = %s AND foi_util = FALSE
    """, (entrada, sugestao))
    rejeicoes = cursor.fetchone()[0]

    if rejeicoes >= 3:
        cursor.execute("""
            INSERT IGNORE INTO exclusoes (input_text, expressao_excluida)
            VALUES (%s, %s)
        """, (entrada, sugestao))

@app.route('/api/feedback', methods=['POST'])
def feedback():
    data = request.get_json(silent=True) or {}
    entrada = (data.get('entrada') or '').strip().lower()
    sugestao = (data.get('sugestao') or '').strip().lower()
    score = data.get('score') or 0.0
    foi_util = bool(data.get('foi_util', False))

    if not entrada or not sugestao:
        return jsonify({'mensagem': 'Faça uma tradução antes de enviar o feedback.', 'status': 'error'}), 400

    db = connect_to_db()
    cursor = db.cursor()
    try:
        registrar_feedback(cursor, entrada, sugestao, score, foi_util)
        db.commit()
        if foi_util:
            mensagem = "🎉 Oba! Ficamos felizes que ajudamos! \n Obrigado pelo feedback positivo!"
        else:
            mensagem = "😔 Poxa, sentimos muito que não foi útil dessa vez. Seu feedback é muito importante e estamos trabalhando para melhorar. \n Por favor, tente novamente com outra palavra ou expressão."
        return jsonify({'mensagem': mensagem, 'status': 'success'}), 200
    except Exception as e:
        db.rollback()
        return jsonify({'erro': str(e), 'mensagem': 'Ocorreu um erro ao processar seu feedback', 'status': 'error'}), 500
    finally:
        cursor.close()
        db.close()

# ----------------- Rota de Áudio ajustada para Frases -----------------
@app.route('/api/transcrever', methods=['POST'])
def transcrever():
    if 'file' not in request.files:
        return jsonify({'mensagem': 'Nenhum arquivo enviado.'}), 400

    f = request.files['file']
    filename = secure_filename(f.filename)
    tmp_dir = tempfile.mkdtemp(prefix='uploads_')
    input_path = os.path.join(tmp_dir, filename)
    output_path = os.path.join(tmp_dir, 'converted.wav')

    try:
        f.save(input_path)
        audio = AudioSegment.from_file(input_path)
        audio.export(output_path, format='wav')

        texto = transcrever_audio_caminho(output_path)
        if not texto:
            return jsonify({'mensagem': 'Não foi possível transcrever o áudio.'}), 500

        resultado = processar_traducao_frase(texto)
        resultado['texto_transcrito'] = texto
        return jsonify(resultado), 200

    except Exception as e:
        return jsonify({'mensagem': 'Erro ao processar arquivo: ' + str(e)}), 500
    finally:
        for path in [input_path, output_path]:
            if os.path.exists(path):
                os.remove(path)
        if os.path.exists(tmp_dir):
            os.rmdir(tmp_dir)

if __name__ == '__main__':
    # Carrega os sinais antes de aceitar requisições, para a primeira tradução já ser rápida
    print("[cache] Carregando sinais do banco (pode levar ~30s)...")
    carregar_cache_sinais()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
