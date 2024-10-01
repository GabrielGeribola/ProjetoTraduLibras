const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Configuração da conexão com o banco de dados

class WordsSlBr extends Model {}

WordsSlBr.init({
  id_word: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  id_animation: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'AnimationUrls', // Tabela de animação referenciada
      key: 'id_animation',
    },
  },
  description: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  d_variable: {
    type: DataTypes.JSON, // Dummy variables armazenadas como JSON
    allowNull: false,
  },
}, {
  sequelize,
  modelName: 'WordsSlBr',
  tableName: 'words_sl_br', // Nome da tabela no banco de dados
  timestamps: false,
});

module.exports = WordsSlBr;
