const pool = require('../config/database');

// Função para buscar a URL do vídeo com base no significado (palavra ou frase)
async function getVideoBySignificado(significado) {
    const [rows] = await pool.execute('SELECT url FROM videos WHERE significado = ?', [significado]);
    return rows[0]; // Retorna a primeira linha encontrada
}

module.exports = { getVideoBySignificado};
