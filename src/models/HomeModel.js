const { Model, DataTypes} = require('sequelize');
const sequelize = require('./database');

class Home extends Model {}

Home.init({
  titulo: {
    type: DataTypes.STRING,
    allowNull: false
  },
  decricao: {
    type: DataTypes.STRING
  }
}, {
  sequelize,
  modelName: 'Home'
});

module.exports = Home;
