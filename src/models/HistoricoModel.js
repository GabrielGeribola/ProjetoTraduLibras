const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Traducao = require('./TraducaoModel');

// Tabela criada pelo script sql/historico.sql
// Liga o usuário (Usuarios_testes.id) às traduções que ele fez.
const Historico = sequelize.define('Historico', {
  id_historico: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  id_traducao: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  data_traducao: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'historico',
  timestamps: false,
});

Historico.belongsTo(Traducao, { foreignKey: 'id_traducao', as: 'traducao' });

module.exports = Historico;
