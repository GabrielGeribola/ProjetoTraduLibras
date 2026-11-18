const Sequelize = require('sequelize');
const db =require('../config/database');

const User = db.define('Usuarios_testes', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true,
    },
   email: {
        type: Sequelize.STRING,
        allowNull: false,
    },
    password: {
      type: Sequelize.STRING,
      allowNull: false,
  },
  // Colunas da área de administração (criadas por src/config/migracoes.js)
  papel: { type: Sequelize.ENUM('usuario', 'admin'), allowNull: false, defaultValue: 'usuario' },
  ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
  id_plano: { type: Sequelize.INTEGER, allowNull: true },
  plano_valido_ate: { type: Sequelize.DATEONLY, allowNull: true },
  ultimo_login: { type: Sequelize.DATE, allowNull: true },
}, {
    tableName: 'Usuarios_testes'
});

//criar a tabela
//User.sync();

//verificase ha alguma diferenca na tabela, realiza a alteracao
//User.sunc({alter: true})

module.exports = User;
