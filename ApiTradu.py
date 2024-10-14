from flask import Flask, request, jsonify
import mysql.connector
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from Levenshtein import distance as levenshtein_distance

app = Flask(__name__)

# Script Matriz esparsa
# Função para conectar ao banco de dados
def connect_to_db():
    return mysql.connector.connect(
        host="db-tradulibras.crywgwekuqzx.us-east-1.rds.amazonaws.com",
        user="tradulibras",
        password="Tradulibras2024",
        database="tradulibras"
    )

# Função para buscar as expressões e suas variáveis dummy
def get_expressions_and_dummy_variables(cursor):
    cursor.execute("SELECT description, d_variable FROM words_sl_br")
    data = cursor.fetchall()

    expressions = [row[0] for row in data]
    dummy_vars = [list(map(int, row[1])) for row in data]  # Convertendo a string binária em lista de inteiros

    return expressions, np.array(dummy_vars)

# Função para calcular a similaridade de cosseno
def find_most_similar_expression(user_input, expressions, dummy_vars):
    input_dummy = np.array([list(map(int, dummy_vars[expressions.index(user_input)]))])

    # Calculando a similaridade de cosseno
    similarity_scores = cosine_similarity(input_dummy, dummy_vars)
    max_score_index = np.argmax(similarity_scores)

    return expressions[max_score_index], similarity_scores[0][max_score_index]

# Função para calcular a distância de Levenshtein
def find_closest_expression_levenshtein(user_input, expressions):
    distances = [levenshtein_distance(user_input, expression) for expression in expressions]
    min_distance_index = np.argmin(distances)

    return expressions[min_distance_index], distances[min_distance_index]

# Função para buscar o vídeo correspondente com base na expressão
def find_animation_url(cursor, expression):
    # Busca na tabela animation_sl_br para encontrar a URL
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

@app.route('/traduzir', methods=['POST'])
def traduzir():
    user_input = request.json.get('palavra')  # Recebe a palavra do corpo da requisição
    db = connect_to_db()
    cursor = db.cursor()

    expressions, dummy_vars = get_expressions_and_dummy_variables(cursor)

    if user_input in expressions:
        url = find_animation_url(cursor, user_input)
        if url:
            response = {"mensagem": f"Vídeo correspondente: {url}"}
        else:
            response = {"mensagem": "Nenhum vídeo encontrado para essa expressão."}
    else:
        closest_expression_lev, lev_distance = find_closest_expression_levenshtein(user_input, expressions)
        most_similar_expression, cosine_score = find_most_similar_expression(closest_expression_lev, expressions, dummy_vars)

        url = find_animation_url(cursor, most_similar_expression)
        if url:
            response = {
                "expressao_levenshtein": closest_expression_lev,
                "distancia_levenshtein": lev_distance,
                "expressao_cosseno": most_similar_expression,
                "similaridade_cosseno": cosine_score,
                "url": url
            }
        else:
            response = {"mensagem": "Nenhum vídeo encontrado para essa expressão."}

    cursor.close()
    db.close()

    return jsonify(response)

# Executa o script principal
if __name__ == "__main__":
    app.run(debug=True)
