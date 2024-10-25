from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import numpy as np
import json
from sklearn.metrics.pairwise import cosine_similarity
from Levenshtein import distance as levenshtein_distance
from nltk.stem import WordNetLemmatizer
import nltk
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
CORS(app, resources={r"/": {"origins": ""}})

nltk.download('wordnet')
nltk.download('punkt')
lemmatizer = WordNetLemmatizer()
model = SentenceTransformer('paraphrase-MiniLM-L6-v2')

def connect_to_db():
    return mysql.connector.connect(
        host="db-tradulibras.crywgwekuqzx.us-east-1.rds.amazonaws.com",
        user="tradulibras",
        password="Tradulibras2024",
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
    similarity_scores = cosine_similarity([user_input_embedding], embeddings)
    max_score_index = np.argmax(similarity_scores)

    max_similarity = similarity_scores[0][max_score_index]

    if max_similarity >= limiar_similaridade:
        return expressions[max_score_index], max_similarity
    else:
        return None, None

def find_closest_expression_levenshtein(user_input, expressions):
    lemmatized_input = lemmatize_expression(user_input)
    distances = [levenshtein_distance(lemmatized_input, lemmatize_expression(expression)) for expression in expressions]

    min_distance_index = np.argmin(distances)
    return expressions[min_distance_index], distances[min_distance_index]

def find_animation_url(cursor, expression):
    cursor.execute("""
        SELECT a.url
        FROM words_sl_br w
        JOIN animation_sl_br a ON w.id_animation = a.id_animation
        WHERE w.description = %s
    """, (expression,))
    result = cursor.fetchone()

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
    db = connect_to_db()
    cursor = db.cursor()

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

    cursor.close()
    db.close()

    return jsonify(response)

if __name__ == "_main_":
    app.run(debug=True)
