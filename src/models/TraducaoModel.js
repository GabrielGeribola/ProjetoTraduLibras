const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Tabela criada pelo script sql/historico.sql
// Cada frase traduzida fica salva uma única vez e é reaproveitada no histórico de vários usuários.
const Traducao = sequelize.define('Traducao', {
  id_traducao: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  texto_original: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  glosa: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  // [{ termo_original, expressao_libras, url }]
  sequencia: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'traducoes',
  timestamps: false,
});

module.exports = Traducao;
