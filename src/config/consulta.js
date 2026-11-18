const { QueryTypes } = require('sequelize');
const sequelize = require('./database');

// Atalhos para SQL com parâmetros nomeados (:nome). Listas viram "IN (:ids)" automaticamente.
// Nunca monte SQL concatenando valores vindos do usuário: use sempre os parâmetros.

/** SELECT: devolve a lista de linhas */
const consultar = (sql, parametros = {}, opcoes = {}) => sequelize.query(sql, {
  replacements: parametros, type: QueryTypes.SELECT, ...opcoes,
});

/** SELECT de uma linha só (ou null) */
async function umaLinha(sql, parametros = {}, opcoes = {}) {
  const [linha] = await consultar(sql, parametros, opcoes);
  return linha || null;
}

/** INSERT/UPDATE/DELETE: devolve { id, linhas } (id inserido e linhas afetadas) */
async function executar(sql, parametros = {}, opcoes = {}) {
  const [resultado, meta] = await sequelize.query(sql, { replacements: parametros, ...opcoes });
  // No MySQL o Sequelize devolve [idInserido, linhasAfetadas] para INSERT e [cabecalho, cabecalho] para o resto
  if (typeof resultado === 'number') return { id: resultado, linhas: typeof meta === 'number' ? meta : 0 };
  const info = (resultado && typeof resultado === 'object' && 'affectedRows' in resultado) ? resultado : meta;
  return { id: info?.insertId || null, linhas: info?.affectedRows ?? 0 };
}

/** Executa a função dentro de uma transação (commit no fim, rollback se der erro) */
const transacao = (fn) => sequelize.transaction(fn);

module.exports = { sequelize, consultar, umaLinha, executar, transacao };
