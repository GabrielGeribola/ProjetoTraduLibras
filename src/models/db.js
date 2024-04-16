const Sequelize = require('sequelize');

const sequelize = new Sequelize('inserir database', 'tradulibras_adm', 'Jv337299', {
  host: 'localhost',
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
