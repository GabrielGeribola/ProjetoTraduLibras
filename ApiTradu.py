from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import mysql.connector
import numpy as np
import json
from sklearn.metrics.pairwise import cosine_similarity
from Levenshtein import distance as levenshtein_distance
from nltk.stem import WordNetLemmatizer
from sentence_transformers import SentenceTransformer
import nltk


nltk.download('wordnet')
nltk.download('punkt')

app = Flask(__name__)
CORS(app, origins=["http://localhost:3306"])
lemmatizer = WordNetLemmatizer()

def connect_to_db():
    return mysql.connector.connect(
        host="db-tradulibras.crywgwekuqzx.us-east-1.rds.amazonaws.com",
        user="tradulibras",
        password="Tradulibras2024",
        database="tradulibras_v2"
    )

# Função para gerar embeddings da entrada do usuário
def gerar_embeddings(texto):
    model = SentenceTransformer('paraphrase-MiniLM-L6-v2')
    embedding = model.encode(texto)
    return embedding

# Função para buscar expressões e embeddings
def get_expressions_and_embeddings(cursor):
    cursor.execute("SELECT description, JSON_EXTRACT(embedding, '$') FROM words_sl_br")
    data = cursor.fetchall()

    expressions = [row[0] for row in data]
    embeddings = [np.array(json.loads(row[1])) for row in data]

    return expressions, np.array(embeddings)

# Função para lematizar expressões
def lemmatize_expression(expression):
    words = expression.split()
    lemmatized_words = [lemmatizer.lemmatize(word.lower()) for word in words]
    return ' '.join(lemmatized_words)

# Função para calcular a similaridade de cosseno
def find_most_similar_expression(user_input_embedding, embeddings, expressions, limiar_similaridade=0.7):
    similarity_scores = cosine_similarity([user_input_embedding], embeddings)
    max_score_index = np.argmax(similarity_scores)

    max_similarity = similarity_scores[0][max_score_index]

    if max_similarity >= limiar_similaridade:
        return expressions[max_score_index], max_similarity
    else:
        return None, None

# Função para calcular a distância de Levenshtein
def find_closest_expression_levenshtein(user_input, expressions):
    lemmatized_input = lemmatize_expression(user_input)
    distances = [levenshtein_distance(lemmatized_input, lemmatize_expression(expression)) for expression in expressions]

    min_distance_index = np.argmin(distances)
    return expressions[min_distance_index], distances[min_distance_index]

# Função para buscar o vídeo correspondente com base na expressão
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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search():
    user_input = request.form['input_text']

    db = connect_to_db()
    cursor = db.cursor()

    try:
        expressions, embeddings = get_expressions_and_embeddings(cursor)

        closest_expression_lev, lev_distance = find_closest_expression_levenshtein(user_input, expressions)

        if lev_distance <= 2:
            url = find_animation_url(cursor, closest_expression_lev)
            return jsonify({'expression': closest_expression_lev, 'url': url})

        embedding_input = gerar_embeddings(user_input)
        most_similar_expression, cosine_score = find_most_similar_expression(embedding_input, embeddings, expressions)

        if most_similar_expression:
            url = find_animation_url(cursor, most_similar_expression)
            return jsonify({'expression': most_similar_expression, 'url': url})

    except Exception as e:
        return jsonify({'error': str(e)})
    finally:
        cursor.close()
        db.close()

    return jsonify({'error': 'Nenhuma correspondência encontrada.'})

0

if __name__ == '__main__':
    app.run(debug=True)





