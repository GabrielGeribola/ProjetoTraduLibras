const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class WordSplit extends Model {}

WordSplit.init({
  id_word_split: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  word_split: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  dummy_variables: {
    type: DataTypes.JSON, // Dummy variables armazenadas como JSON
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'WordSplit',
  tableName: 'word_split',
  timestamps: false,
});

module.exports = WordSplit;
