const pool = require('../config/database')

//Função para buscar as dummy variables associadas a um ID específico
async function getDummyVariablesById(id) {
  const [rows] = await pool.execute('SELECT * FROM (Inserir nome da tabela de dummy variables) WHERE id = ?', [id]);
  return rows[0]; //Retorna a primeira linha encontrada
}


module.exports = {getDummyVariablesById};
