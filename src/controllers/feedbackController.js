const sequelize = require('../config/database');
const { Feedback, ExclusaoUsuario } = require('../models/FeedbackModel');
const { LIMITE_TEXTO, textoLimpo, buscarOuCriarTraducao } = require('../services/traducaoService');

const LIMITE_SINAIS_POR_VOTO = 30;

function normalizar(valor) {
  return textoLimpo(valor).toLowerCase().slice(0, 100);
}

// [{ termo, expressao }] sem repetição e sem itens vazios
function sinaisLimpos(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Map();
  lista.slice(0, LIMITE_SINAIS_POR_VOTO).forEach((item) => {
    const termo = normalizar(item?.termo);
    const expressao = normalizar(item?.expressao);
    if (termo && expressao) vistos.set(`${termo}\u0000${expressao}`, { termo, expressao });
  });
  return [...vistos.values()];
}

// POST /feedback — voto do usuário logado sobre uma tradução.
// Visitantes não chamam esta rota: o voto deles fica só no navegador, durante a sessão.
exports.salvar = async (req, res) => {
  const usuario = req.session.user;
  if (!usuario || !usuario.id) {
    return res.status(401).json({ status: 'error', codigo: 'LOGIN_NECESSARIO', mensagem: 'Entre na sua conta para salvar o feedback.' });
  }

  const texto = textoLimpo(req.body.texto);
  const glosa = textoLimpo(req.body.glosa).slice(0, LIMITE_TEXTO) || null;
  const foiUtil = req.body.foi_util;
  const sinais = foiUtil === false ? sinaisLimpos(req.body.sinais_incorretos) : [];

  if (!texto || texto.length > LIMITE_TEXTO || typeof foiUtil !== 'boolean') {
    return res.status(400).json({ status: 'error', codigo: 'DADOS_INVALIDOS', mensagem: 'Dados de feedback inválidos.' });
  }

  try {
    const traducao = await buscarOuCriarTraducao(texto, glosa, null);

    const exclusoes = await sequelize.transaction(async (transaction) => {
      // Um voto por usuário em cada frase: votar de novo substitui o voto anterior
      await Feedback.upsert({
        id_usuario: usuario.id,
        id_traducao: traducao.id_traducao,
        foi_util: foiUtil,
        glosa,
      }, { transaction });
      const voto = await Feedback.findOne({
        where: { id_usuario: usuario.id, id_traducao: traducao.id_traducao },
        transaction,
      });

      if (sinais.length > 0) {
        await ExclusaoUsuario.bulkCreate(sinais.map((s) => ({
          id_usuario: usuario.id,
          termo: s.termo,
          expressao_excluida: s.expressao,
          id_feedback: voto.id_feedback,
        })), { ignoreDuplicates: true, transaction });
      }
      return sinais;
    });

    return res.json({ status: 'success', exclusoes });
  } catch (e) {
    console.error('Erro ao salvar feedback:', e);
    return res.status(500).json({ status: 'error', codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível salvar seu feedback agora.' });
  }
};

// POST /feedback/exclusoes/restaurar — volta a usar um sinal (ou todos) que o usuário tinha ocultado
exports.restaurar = async (req, res) => {
  const where = { id_usuario: req.session.user.id };
  if (req.body.todos !== '1') {
    where.termo = normalizar(req.body.termo);
    where.expressao_excluida = normalizar(req.body.expressao);
  }

  try {
    const removidos = (where.termo !== '' && where.expressao_excluida !== '')
      ? await ExclusaoUsuario.destroy({ where })
      : 0;
    if (removidos > 0) {
      req.flash('success', removidos === 1 ? 'O sinal voltou a ser usado nas suas traduções.' : 'Todos os sinais voltaram a ser usados nas suas traduções.');
    } else {
      req.flash('errors', 'Sinal não encontrado.');
    }
  } catch (e) {
    console.error('Erro ao restaurar sinal:', e);
    req.flash('errors', 'Não foi possível restaurar o sinal.');
  }

  req.session.save(() => res.redirect('/historico#sinais-ocultos'));
};
