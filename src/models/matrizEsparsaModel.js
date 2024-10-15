/*const pool = require('../config/database');

//Função para buscar a matriz esparsa associada a uma palavra
async function getMatrizEsparsaByPalavra(palavra) {
  //substituir representacao_esparca para nome real da coluna
  const [rows] = await pool.execute('SELECT representacao_esparsa FROM (inserir nome da tabela) WHERE palavra = ?', [palavra]);
  return JSON.parse(rows[0].representacao_esparsa); //Converte de JSON
}

module.exports = {getMatrizEsparsaByPalavra};
*/
