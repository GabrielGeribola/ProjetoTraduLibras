const Sequelize = require('sequelize');
const db =require('../config/database');

const User = db.define('users', {
    id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        allowNull: false,
        primaryKey: true,
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false,
    },
   email: {
        type: Sequelize.STRING,
        allowNull: false,
    }
});

//criar a tabela
//User.sync();

//verificase ha alguma diferenca na tabela, realiza a alteracao
//User.sunc({alter: true})

module.exports = User;