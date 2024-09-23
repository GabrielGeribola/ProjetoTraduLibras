const pool = require('../../config/db');

async function insertVideo(url) {
  const [rows] = await pool.execute('INSERT INTO videos (url) VALUES (?)', [url]);
  return rows.insertId;
}

async function getVideoByUrl(url) {
  const [rows] = await pool.execute('SELECT id FROM videos WHERE url = ?', [url]);
  return rows[0];
}

module.exports = { insertVideo, getVideoByUrl };
