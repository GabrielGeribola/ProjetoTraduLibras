const { UniqueConstraintError } = require('sequelize');
const Traducao = require('../models/TraducaoModel');
const Historico = require('../models/HistoricoModel');

const LIMITE_TEXTO = 500;
const LIMITE_ITENS_PAGINA = 200;

function textoLimpo(valor) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/\s+/g, ' ').trim();
}

// Guarda só os campos usados pelo site, com tamanho limitado
function sequenciaLimpa(sequencia) {
  if (!Array.isArray(sequencia)) return null;

  return sequencia.slice(0, 100).map((item) => {
    const url = textoLimpo(item?.url);
    return {
      termo_original: textoLimpo(item?.termo_original).slice(0, 100),
      expressao_libras: textoLimpo(item?.expressao_libras).slice(0, 100),
      url: url.startsWith('https://') ? url.slice(0, 500) : '',
    };
  });
}

// Reaproveita a tradução se a frase já foi traduzida antes (por qualquer usuário)
async function buscarOuCriarTraducao(texto, glosa, sequencia) {
  const existente = await Traducao.findOne({ where: { texto_original: texto } });
  if (existente) return existente;

  try {
    return await Traducao.create({ texto_original: texto, glosa, sequencia });
  } catch (e) {
    // Outra requisição criou a mesma frase ao mesmo tempo
    if (e instanceof UniqueConstraintError) {
      return Traducao.findOne({ where: { texto_original: texto } });
    }
    throw e;
  }
}

// GET /historico — lista apenas as traduções do usuário logado
exports.index = async (req, res) => {
  try {
    const itens = await Historico.findAll({
      where: { id_usuario: req.session.user.id },
      include: [{ model: Traducao, as: 'traducao' }],
      order: [['data_traducao', 'DESC'], ['id_historico', 'DESC']],
      limit: LIMITE_ITENS_PAGINA,
    });

    return res.render('historico', { itens, erroCarregar: false });
  } catch (e) {
    console.error('Erro ao carregar histórico:', e);
    return res.render('historico', { itens: [], erroCarregar: true });
  }
};

// POST /historico — chamado pela home quando uma tradução dá certo
exports.salvar = async (req, res) => {
  const usuario = req.session.user;
  if (!usuario || !usuario.id) {
    return res.status(401).json({ status: 'error', mensagem: 'Faça login para salvar o histórico.' });
  }

  const texto = textoLimpo(req.body.texto);
  if (!texto || texto.length > LIMITE_TEXTO) {
    return res.status(400).json({ status: 'error', mensagem: 'Texto inválido.' });
  }

  const glosa = textoLimpo(req.body.glosa).slice(0, LIMITE_TEXTO) || null;
  const sequencia = sequenciaLimpa(req.body.sequencia);

  try {
    const traducao = await buscarOuCriarTraducao(texto, glosa, sequencia);

    // id_usuario vem sempre da sessão, nunca do que o navegador envia
    const item = await Historico.create({
      id_usuario: usuario.id,
      id_traducao: traducao.id_traducao,
    });

    return res.status(201).json({ status: 'success', id_historico: item.id_historico });
  } catch (e) {
    console.error('Erro ao salvar histórico:', e);
    return res.status(500).json({ status: 'error', mensagem: 'Não foi possível salvar no histórico.' });
  }
};

// POST /historico/:id/excluir — só apaga se o item for do usuário logado
exports.excluir = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);

  try {
    const apagados = Number.isInteger(id)
      ? await Historico.destroy({ where: { id_historico: id, id_usuario: req.session.user.id } })
      : 0;

    if (apagados > 0) {
      req.flash('success', 'Tradução removida do histórico.');
    } else {
      req.flash('errors', 'Item do histórico não encontrado.');
    }
  } catch (e) {
    console.error('Erro ao excluir item do histórico:', e);
    req.flash('errors', 'Não foi possível remover o item do histórico.');
  }

  req.session.save(() => res.redirect('/historico'));
};
