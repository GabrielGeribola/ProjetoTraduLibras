require('dotenv').config();
const Sequelize = require('sequelize');

const sequelize = new Sequelize(process.env.DB_DATABASE, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect:  'mysql'
});


//Validar se a conexão do BD está funcionando.
sequelize.authenticate()
.then(() => {
  console.log("Conexão com banco de dados realizada com sucesso.")
}).catch(e => {
  console.log("Erro: Conexão com o banco de dados não realizada com sucesso.")
})

module.exports = sequelize;
