from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import mysql.connector
import numpy as np
import json
from sklearn.metrics.pairwise import cosine_similarity
from Levenshtein import distance as levenshtein_distance
from nltk.stem import WordNetLemmatizer
from sentence_transformers import SentenceTransformer
import nltk
import os
import tempfile
from werkzeug.utils import secure_filename
from pydub import AudioSegment
import speech_recognition as sr

# Baixar dados NLTK
nltk.download('wordnet')
nltk.download('punkt')

app = Flask(__name__)
CORS(app)

lemmatizer = WordNetLemmatizer()
model = SentenceTransformer('paraphrase-MiniLM-L6-v2')

def connect_to_db():
    return mysql.connector.connect(
        host="db-tradulibras.crywgwekuqzx.us-east-1.rds.amazonaws.com",
        user="tradulibras",
        password="Tradulibras2024",
        database="app_tradu_embedding"
    )

def gerar_embeddings(texto):
    tokens = texto.split()
    vetores = [model.encode(token) for token in tokens]
    return np.mean(vetores, axis=0)

def get_expressions_and_embeddings(cursor):
    cursor.execute("SELECT description, JSON_EXTRACT(embedding, '$') FROM words_sl_br")
    data = cursor.fetchall()
    expressions = [row[0] for row in data]
    embeddings = [np.array(json.loads(row[1])) for row in data]
    return expressions, np.array(embeddings)

def lemmatize_expression(expression):
    words = expression.split()
    lemmatized_words = [lemmatizer.lemmatize(word.lower()) for word in words]
    return ' '.join(lemmatized_words)

def find_most_similar_expression(user_input_embedding, embeddings, expressions):
    similarity_scores = cosine_similarity([user_input_embedding], embeddings)
    max_score_index = np.argmax(similarity_scores)
    max_similarity = similarity_scores[0][max_score_index]
    return expressions[max_score_index], max_similarity

def find_closest_expression_levenshtein(user_input, expressions):
    lemmatized_input = lemmatize_expression(user_input)
    distances = [levenshtein_distance(lemmatized_input, lemmatize_expression(expr)) for expr in expressions]
    min_distance_index = np.argmin(distances)
    return expressions[min_distance_index], distances[min_distance_index]

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

def esta_na_lista_de_exclusao(cursor, entrada, sugestao):
    cursor.execute("""
        SELECT 1 FROM exclusoes
        WHERE input_text = %s AND expressao_excluida = %s
    """, (entrada.lower(), sugestao.lower()))
    return cursor.fetchone() is not None

def registrar_feedback(cursor, entrada, sugestao, score, foi_util):
    cursor.execute("""
        INSERT INTO feedback_log (input_text, expressao_sugerida, score, foi_util)
        VALUES (%s, %s, %s, %s)
    """, (entrada.lower(), sugestao.lower(), float(score), foi_util))

    cursor.execute("""
        SELECT COUNT(*) FROM feedback_log
        WHERE input_text = %s AND expressao_sugerida = %s AND foi_util = FALSE
    """, (entrada.lower(), sugestao.lower()))
    rejeicoes = cursor.fetchone()[0]

    if rejeicoes >= 3:
        cursor.execute("""
            INSERT IGNORE INTO exclusoes (input_text, expressao_excluida)
            VALUES (%s, %s)
        """, (entrada.lower(), sugestao.lower()))

# ----------------- Função de transcrição (escopo global) -----------------
def transcrever_audio_caminho(file_path):
    """
    Transcreve áudio usando speech_recognition + Google Web Speech API.
    Recebe um arquivo .wav (convertido previamente).
    Retorna texto transcrito ou None.
    """
    r = sr.Recognizer()
    try:
        with sr.AudioFile(file_path) as source:
            audio = r.record(source)
        texto = r.recognize_google(audio, language='pt-BR')
        return texto
    except sr.UnknownValueError:
        return None
    except sr.RequestError as e:
        print("Erro na API do Google Speech:", e)
        return None
    except Exception as e:
        print("Erro inesperado em transcrever_audio_caminho:", e)
        return None

# ----------------- Função que reaproveita lógica de sugestão -----------------
def buscar_sugestao_por_texto(user_input):
    db = connect_to_db()
    cursor = db.cursor()
    try:
        expressions, embeddings = get_expressions_and_embeddings(cursor)
        user_input_lem = lemmatize_expression(user_input)
        embedding_input = gerar_embeddings(user_input_lem)
        sugestao_expr, score = find_most_similar_expression(embedding_input, embeddings, expressions)

        if sugestao_expr and not esta_na_lista_de_exclusao(cursor, user_input, sugestao_expr):
            url = find_animation_url(cursor, sugestao_expr)
            nivel_conf = 'alta' if score >= 0.8 else ('baixa' if score >= 0.6 else 'nenhuma')
            if nivel_conf != 'nenhuma':
                return {
                    'expressao': sugestao_expr,
                    'score': float(score),
                    'nivel_confianca': nivel_conf,
                    'url': url
                }

        # Fallback Levenshtein
        closest_expr, dist = find_closest_expression_levenshtein(user_input, expressions)
        if dist <= 2 and not esta_na_lista_de_exclusao(cursor, user_input, closest_expr):
            url = find_animation_url(cursor, closest_expr)
            return {
                'expressao': closest_expr,
                'score': 0.0,
                'nivel_confianca': 'resultado por proximidade de escrita',
                'url': url
            }

        return {'mensagem': 'not_found', 'status': 'not_found'}
    except Exception as e:
        return {'erro': str(e), 'mensagem': 'error', 'status': 'error'}
    finally:
        cursor.close()
        db.close()

# ----------------- Rota /api/transcrever -----------------
@app.route('/api/transcrever', methods=['POST'])
def transcrever():
    if 'file' not in request.files:
        return jsonify({'mensagem': 'Nenhum arquivo enviado.'}), 400

    f = request.files['file']
    if f.filename == '':
        return jsonify({'mensagem': 'Arquivo sem nome.'}), 400

    filename = secure_filename(f.filename)
    tmp_dir = tempfile.mkdtemp(prefix='uploads_')
    input_path = os.path.join(tmp_dir, filename)
    output_path = os.path.join(tmp_dir, 'converted.wav')

    try:
        f.save(input_path)

        # Converter webm/ogg/mp3 → wav (pydub + ffmpeg)
        try:
            audio = AudioSegment.from_file(input_path)
            audio.export(output_path, format='wav')
        except Exception as e:
            print("Erro na conversão de áudio:", e)
            return jsonify({'mensagem': 'Erro ao converter o áudio.'}), 500

        # Transcrever com SpeechRecognition (Google)
        texto = transcrever_audio_caminho(output_path)
        if not texto:
            return jsonify({'mensagem': 'Não foi possível transcrever o áudio.'}), 500

        # Buscar sugestão com o texto transcrito
        sugestao_result = buscar_sugestao_por_texto(texto)
        response_payload = {'texto': texto}

        if sugestao_result and sugestao_result.get('expressao'):
            response_payload.update(sugestao_result)
            return jsonify(response_payload), 200
        else:
            response_payload.update({
                'mensagem': 'Transcrição concluída, mas nenhuma expressão encontrada.',
                'sugestao_link': '/sugestoes'
            })
            return jsonify(response_payload), 404

    except Exception as e:
        return jsonify({'mensagem': 'Erro ao processar arquivo: ' + str(e)}), 500

    finally:
        # apagar os arquivos temporários
        try:
            for path in [input_path, output_path]:
                if os.path.exists(path):
                    os.remove(path)
            if os.path.exists(tmp_dir):
                os.rmdir(tmp_dir)
        except Exception as e:
            print('Erro ao limpar arquivos temporários:', e)

# ----------------- Rota /api/sugestao (mantida) -----------------
@app.route('/api/sugestao', methods=['POST'])
def sugestao():
    user_input = request.json.get('texto')
    db = connect_to_db()
    cursor = db.cursor()
    try:
        expressions, embeddings = get_expressions_and_embeddings(cursor)
        user_input_lem = lemmatize_expression(user_input)
        embedding_input = gerar_embeddings(user_input_lem)
        sugestao_expr, score = find_most_similar_expression(embedding_input, embeddings, expressions)

        if sugestao_expr and not esta_na_lista_de_exclusao(cursor, user_input, sugestao_expr):
            url = find_animation_url(cursor, sugestao_expr)
            nivel_conf = 'alta' if score >= 0.8 else ('baixa' if score >= 0.6 else 'nenhuma')
            if nivel_conf != 'nenhuma':
                return jsonify({
                    'expressao': sugestao_expr,
                    'score': score,
                    'nivel_confianca': nivel_conf,
                    'url': url
                })

        # Tentar Levenshtein como fallback
        closest_expr, dist = find_closest_expression_levenshtein(user_input, expressions)
        if dist <= 2 and not esta_na_lista_de_exclusao(cursor, user_input, closest_expr):
            url = find_animation_url(cursor, closest_expr)
            return jsonify({
                'expressao': closest_expr,
                'score': 0.0,
                'nivel_confianca': 'resultado por proximidade de escrita',
                'url': url
            })

        mensagem = (
            "🤔 Hmm, não encontramos uma correspondência exata para sua busca...\n\n"
            "Mas não se preocupe! Você pode:\n"
            "✨ Tentar outra palavra ou expressão\n"
            "🔍 Verificar a grafia\n"
            "📚 Visitar nossa página de sugestões para encontrar outras inspirações!\n\n"
        )
        
        return jsonify({
            'mensagem': mensagem,
            'status': 'not_found',
            'sugestao_link': '/sugestoes'
        }), 404
        
    except Exception as e:
        return jsonify({
            'erro': str(e),
            'mensagem': '😅 Oops! Algo inesperado aconteceu...',
            'status': 'error'
        }), 500
    finally:
        cursor.close()
        db.close()

# ----------------- Rota /api/feedback (mantida) -----------------
@app.route('/api/feedback', methods=['POST'])
def feedback():
    data = request.json
    entrada = data.get('entrada')
    sugestao = data.get('sugestao')
    score = data.get('score', 0.0)
    foi_util = data.get('foi_util', False)

    db = connect_to_db()
    cursor = db.cursor()
    try:
        registrar_feedback(cursor, entrada, sugestao, score, foi_util)
        db.commit()
        if foi_util:
            mensagem = "🎉 Oba! Ficamos felizes que ajudamos! \n Obrigado pelo feedback positivo!"
        else:
            mensagem = "😔 Poxa, Seu feedback é muito importante para nós e estamos trabalhando para melhorar, sentimos muito que não foi útil dessa vez... \n Por favor, tente novamente com outra palavra ou expressão."
        
        return jsonify({
            'mensagem': mensagem,
            'status': 'success'
        })
    
    except Exception as e:
        db.rollback()
        return jsonify({
            'erro': str(e),
            'mensagem': 'Ocorreu um erro ao processar seu feedback',
            'status': 'error'
        }), 500
    finally:
        cursor.close()
        db.close()

if __name__ == '__main__':
    app.run(debug=True)
