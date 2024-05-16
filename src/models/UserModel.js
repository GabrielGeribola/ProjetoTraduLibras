const Sequelize = require('sequelize');
const db =require('../config/database');

const User = db.define('Usuarios_teste', {
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
  }
});

//criar a tabela
//User.sync();

//verificase ha alguma diferenca na tabela, realiza a alteracao
//User.sunc({alter: true})

module.exports = User;
