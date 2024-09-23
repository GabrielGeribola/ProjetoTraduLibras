const pool = require('../../config/db');

async function insertSignificado(texto, videoId) {
  await pool.execute('INSERT INTO significados (texto, video_id) VALUES (?, ?)', [texto, videoId]);
}

async function getSignificadoByTexto(texto) {
  const [rows] = await pool.execute('SELECT * FROM significados WHERE texto = ?', [texto]);
  return rows[0];
}

module.exports = { insertSignificado, getSignificadoByTexto };
