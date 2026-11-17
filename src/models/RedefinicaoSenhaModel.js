const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Tabela criada pelo script sql/feedback_e_senha.sql
// Guarda só o hash (SHA-256) do token enviado por e-mail: quem lê o banco não consegue usar o link.
const RedefinicaoSenha = sequelize.define('RedefinicaoSenha', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_usuario: { type: DataTypes.INTEGER, allowNull: false },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false },
  expira_em: { type: DataTypes.DATE, allowNull: false },
  usado_em: { type: DataTypes.DATE, allowNull: true },
  criado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'redefinicao_senha',
  timestamps: false,
});

module.exports = RedefinicaoSenha;
