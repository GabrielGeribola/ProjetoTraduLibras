const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Tabelas criadas pelo script sql/feedback_e_senha.sql

// Um voto por usuário em cada frase (votar de novo atualiza o voto)
const Feedback = sequelize.define('Feedback', {
  id_feedback: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  id_usuario: { type: DataTypes.INTEGER, allowNull: false },
  id_traducao: { type: DataTypes.INTEGER, allowNull: false },
  foi_util: { type: DataTypes.BOOLEAN, allowNull: false },
  glosa: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'feedback_traducao',
  timestamps: true,
  createdAt: 'criado_em',
  updatedAt: 'atualizado_em',
});

// Sinal que o usuário marcou como incorreto para um termo da glosa.
// Só vale para as traduções desse usuário.
const ExclusaoUsuario = sequelize.define('ExclusaoUsuario', {
  id_usuario: { type: DataTypes.INTEGER, primaryKey: true },
  termo: { type: DataTypes.STRING(100), primaryKey: true },
  expressao_excluida: { type: DataTypes.STRING(100), primaryKey: true },
  id_feedback: { type: DataTypes.INTEGER, allowNull: true },
  criado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'exclusoes_usuario',
  timestamps: false,
});

// Lista enviada ao navegador e repassada à API de tradução
async function exclusoesDoUsuario(idUsuario) {
  const linhas = await ExclusaoUsuario.findAll({
    where: { id_usuario: idUsuario },
    order: [['criado_em', 'DESC']],
    limit: 200,
  });
  return linhas.map((l) => ({ termo: l.termo, expressao: l.expressao_excluida, criado_em: l.criado_em }));
}

module.exports = { Feedback, ExclusaoUsuario, exclusoesDoUsuario };
