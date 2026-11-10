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

def encontrar_melhor_sinal(termo, expressions, embeddings, cursor):
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

def processar_traducao_frase(cursor, frase_usuario):
    expressions, embeddings = get_expressions_and_embeddings(cursor)
    
    # 1. Converter frase em estrutura de Libras (Glosa)
    glosa = portugues_para_glosa_libras(frase_usuario)
    termos_glosa = glosa.split()
    
    sequencia_animacoes = []
    
    # 2. Mapear cada termo da glosa para um sinal cadastrado no banco
    for termo in termos_glosa:
        sinal_encontrado, score = encontrar_melhor_sinal(termo, expressions, embeddings, cursor)
        if sinal_encontrado:
            url = find_animation_url(cursor, sinal_encontrado)
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

    db = connect_to_db()
    cursor = db.cursor()
    try:
        resultado = processar_traducao_frase(cursor, user_input)
        
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

        db = connect_to_db()
        cursor = db.cursor()
        try:
            resultado = processar_traducao_frase(cursor, texto)
            resultado['texto_transcrito'] = texto
            return jsonify(resultado), 200
        finally:
            cursor.close()
            db.close()

    except Exception as e:
        return jsonify({'mensagem': 'Erro ao processar arquivo: ' + str(e)}), 500
    finally:
        for path in [input_path, output_path]:
            if os.path.exists(path):
                os.remove(path)
        if os.path.exists(tmp_dir):
            os.rmdir(tmp_dir)

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=False)
