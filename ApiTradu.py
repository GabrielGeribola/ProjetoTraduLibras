from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import mysql.connector
import numpy as np
import json
from sklearn.metrics.pairwise import cosine_similarity
from Levenshtein import distance as levenshtein_distance
from nltk.stem import WordNetLemmatizer
<<<<<<< HEAD
import nltk
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

nltk.download('wordnet')
nltk.download('punkt')
=======
from sentence_transformers import SentenceTransformer
import nltk

# Baixar dados NLTK
nltk.download('wordnet')
nltk.download('punkt')

app = Flask(__name__)
CORS(app)

>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
lemmatizer = WordNetLemmatizer()
model = SentenceTransformer('paraphrase-MiniLM-L6-v2')

def connect_to_db():
    return mysql.connector.connect(
        host="db-tradulibras.crywgwekuqzx.us-east-1.rds.amazonaws.com",
        user="tradulibras",
        password="Tradulibras2024",
<<<<<<< HEAD
        database="tradulibras_v2"
    )

def get_expressions_and_embeddings(cursor):
    cursor.execute("SELECT description, JSON_EXTRACT(embedding, '$') FROM words_sl_br")
    data = cursor.fetchall()

    expressions = [row[0] for row in data]
    embeddings = [np.array(json.loads(row[1])) for row in data]

    return expressions, np.array(embeddings)

def lemmatize_expression(expression):
    if expression is not None:
        words = expression.split()
        lemmatized_words = [lemmatizer.lemmatize(word.lower()) for word in words]
        return ' '.join(lemmatized_words)
    return ""

def find_most_similar_expression(user_input_embedding, embeddings, expressions, limiar_similaridade=0.7):
=======
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
>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
    similarity_scores = cosine_similarity([user_input_embedding], embeddings)
    max_score_index = np.argmax(similarity_scores)
    max_similarity = similarity_scores[0][max_score_index]
    return expressions[max_score_index], max_similarity

<<<<<<< HEAD
    max_similarity = similarity_scores[0][max_score_index]

    if max_similarity >= limiar_similaridade:
        return expressions[max_score_index], max_similarity
    else:
        return None, None

def find_closest_expression_levenshtein(user_input, expressions):
    lemmatized_input = lemmatize_expression(user_input)
    distances = [levenshtein_distance(lemmatized_input, lemmatize_expression(expression)) for expression in expressions]

=======
def find_closest_expression_levenshtein(user_input, expressions):
    lemmatized_input = lemmatize_expression(user_input)
    distances = [levenshtein_distance(lemmatized_input, lemmatize_expression(expr)) for expr in expressions]
>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
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

<<<<<<< HEAD
    if result:
        return result[0]
    return None


def gerar_embeddings(texto):
    embedding = model.encode(texto)
    return embedding


@app.route('/process_expression', methods=['POST'])
def process_expression():
    data = request.json
    user_input = data.get('user_input', None)
    
    if user_input is None or user_input == "":
        return jsonify({"mensagem": "Entrada inválida!"}), 400
    
    lemmatized_input = lemmatize_expression(user_input)
    
    return jsonify({
        "mensagem": "Processamento bem-sucedido!",
        "lematizado": lemmatized_input
    }), 200

@app.route('/translate', methods=['POST'])
def traduzir():
    user_input = request.json.get('palavra') 
=======
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

@app.route('/api/sugestao', methods=['POST'])
def sugestao():
    user_input = request.json.get('texto')
>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
    db = connect_to_db()
    cursor = db.cursor()
    try:
        expressions, embeddings = get_expressions_and_embeddings(cursor)
        user_input_lem = lemmatize_expression(user_input)
        embedding_input = gerar_embeddings(user_input_lem)
        sugestao_expr, score = find_most_similar_expression(embedding_input, embeddings, expressions)

<<<<<<< HEAD
    expressions, embeddings = get_expressions_and_embeddings(cursor)

    
    closest_expression_lev, lev_distance = find_closest_expression_levenshtein(user_input, expressions)

    if lev_distance <= 6:
        url = find_animation_url(cursor, closest_expression_lev)
        if url:
            response = {"mensagem": f"Vídeo correspondente: {url}"}
        else:
            response = {"mensagem": "Nenhum vídeo encontrado para essa expressão."}
    else:
        embedding_input = gerar_embeddings(user_input)
        most_similar_expression, cosine_score = find_most_similar_expression(embedding_input, embeddings, expressions)

        if most_similar_expression:
            url = find_animation_url(cursor, most_similar_expression)
            response = {
                "expressao_cosseno": most_similar_expression,
                "similaridade_cosseno": cosine_score,
                "url": url if url else "Nenhum vídeo encontrado"
            }
        else:
            response = {"mensagem": "Nenhuma correspondência encontrada com similaridade suficiente."}
=======
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

        return jsonify({'mensagem': 'Nenhuma correspondência confiável encontrada.'}), 404
    except Exception as e:
        return jsonify({'erro': str(e)}), 500
    finally:
        cursor.close()
        db.close()
>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c

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
        return jsonify({'mensagem': 'Feedback registrado com sucesso'})
    except Exception as e:
        db.rollback()
        return jsonify({'erro': str(e)}), 500
    finally:
        cursor.close()
        db.close()

<<<<<<< HEAD
if __name__ == "__main__":
=======
if __name__ == '__main__':
>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
    app.run(debug=True)
