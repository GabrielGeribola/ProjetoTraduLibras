require('dotenv').config();
const Sequelize = require('sequelize');

const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
});

// Tenta conectar mas não quebra o app se falhar
sequelize.authenticate()
  .then(() => console.log('Conexão com banco de dados realizada com sucesso.'))
  .catch(() => console.warn('Aviso: Banco de dados indisponível. Rodando sem BD.'));

module.exports = sequelize;