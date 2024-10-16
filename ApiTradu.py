from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from nltk.stem import WordNetLemmatizer
import nltk

# Certifique-se de que os recursos do NLTK estão disponíveis
nltk.download('wordnet')
nltk.download('punkt')

# Inicializa o lemmatizer
lemmatizer = WordNetLemmatizer()

app = Flask(__name__)
CORS(app)  # Permite todas as origens


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
    dummy_vars = []

    for row in data:
        d_variable_str = row[1]
        if d_variable_str and d_variable_str.strip():
            d_variable_cleaned = d_variable_str.replace(' ', '')
            if len(d_variable_cleaned) == 45:
                dummy_var = list(map(int, d_variable_cleaned))
            else:
                dummy_var = list(map(int, d_variable_cleaned.ljust(45, '0')[:45]))
            dummy_vars.append(dummy_var)
        else:
            dummy_vars.append([0] * 45)

    return expressions, np.array(dummy_vars)

# Função para lematizar expressões
def lemmatize_expression(expression):
    words = expression.split()
    lemmatized_words = [lemmatizer.lemmatize(word.lower()) for word in words]
    return ' '.join(lemmatized_words)

# Função para calcular a similaridade de cosseno
def find_most_similar_expression(user_input_dummy, expressions, dummy_vars):
    similarity_scores = cosine_similarity(user_input_dummy, dummy_vars)
    max_score_index = np.argmax(similarity_scores)
    return expressions[max_score_index], similarity_scores[0][max_score_index]

# Função para buscar o vídeo correspondente com base na expressão
def find_animation_url(cursor, expression):
    cursor.execute("""
        SELECT a.url
        FROM words_sl_br w
        JOIN animation_sl_br a ON w.id_animation = a.id_animation
        WHERE w.description = %s
    """, (expression,))
    result = cursor.fetchone()
    return result[0] if result else None

@app.route('/translate', methods=['POST'])
def traduzir():
    user_input = request.json.get('palavra')  # Recebe a palavra do corpo da requisição
    db = connect_to_db()
    cursor = db.cursor()

    expressions, dummy_vars = get_expressions_and_dummy_variables(cursor)

    # Lematiza a entrada do usuário
    lemmatized_input = lemmatize_expression(user_input)

    # Tenta encontrar a expressão mais similar usando a similaridade de cosseno
    try:
        input_dummy = np.array([dummy_vars[expressions.index(lemmatized_input)]])
        most_similar_expression, similarity_score = find_most_similar_expression(input_dummy, expressions, dummy_vars)
    except ValueError:
        return jsonify({"mensagem": f"Erro: '{lemmatized_input}' não encontrado nas expressões."})

    url = find_animation_url(cursor, most_similar_expression)
    
    if url:
        response = {
            "palavra_encontrada": most_similar_expression,
            "video_url": url  # Retorna a URL do vídeo
        }
    else:
        response = {"mensagem": "Nenhum vídeo encontrado para essa expressão."}

    cursor.close()
    db.close()

    return jsonify(response)

# Executa o script principal
if __name__ == "__main__":
    app.run(debug=True)  # Executa em modo debug
