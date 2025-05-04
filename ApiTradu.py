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


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/search', methods=['POST'])
def search():
    user_input = request.json.get('input_text')
    db = connect_to_db()
    cursor = db.cursor()

    try:
        expressions, embeddings = get_expressions_and_embeddings(cursor)
        user_input_lem = lemmatize_expression(user_input)
        embedding_input = gerar_embeddings(user_input_lem)

        expression, score = find_most_similar_expression(embedding_input, embeddings, expressions)

        if expression and not esta_na_lista_de_exclusao(cursor, user_input, expression):
            confidence = "alta" if score >= 0.8 else "media" if score >= 0.6 else "baixa"
            if score >= 0.6:
                url = find_animation_url(cursor, expression)
                return jsonify({
                    'expression': expression,
                    'score': score,
                    'confidence': confidence,
                    'url': url,
                })

        expression_lev, distance = find_closest_expression_levenshtein(user_input, expressions)
        if distance <= 2 and not esta_na_lista_de_exclusao(cursor, user_input, expression_lev):
            url = find_animation_url(cursor, expression_lev)
            return jsonify({
                'expression': expression_lev,
                'score': 0.0,
                'confidence': 'baixa',
                'url': url,
            })

        return jsonify({'error': 'Nenhuma correspondência confiável encontrada.'})

    except Exception as e:
        return jsonify({'error': str(e)})
    finally:
        cursor.close()
        db.close()


@app.route('/feedback', methods=['POST'])
def feedback():
    data = request.json
    entrada = data.get('input_text')
    sugestao = data.get('expression')
    score = data.get('score')
    foi_util = data.get('foi_util')

    db = connect_to_db()
    cursor = db.cursor()
    try:
        registrar_feedback(cursor, entrada, sugestao, score, foi_util)
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)})
    finally:
        cursor.close()
        db.close()


if __name__ == '__main__':
    app.run(debug=True)
