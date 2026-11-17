const Traducao = require('../models/TraducaoModel');
const Historico = require('../models/HistoricoModel');
const { exclusoesDoUsuario } = require('../models/FeedbackModel');
const { LIMITE_TEXTO, textoLimpo, sequenciaLimpa, buscarOuCriarTraducao } = require('../services/traducaoService');

const LIMITE_ITENS_PAGINA = 200;

// GET /historico — visitante vê a página com o convite para entrar;
// usuário logado vê apenas as próprias traduções e os sinais que ocultou.
exports.index = async (req, res) => {
  if (!req.session.user) {
    return res.render('historico', { bloqueado: true, itens: [], exclusoes: [], erroCarregar: false });
  }

  try {
    const [itens, exclusoes] = await Promise.all([
      Historico.findAll({
        where: { id_usuario: req.session.user.id },
        include: [{ model: Traducao, as: 'traducao' }],
        order: [['data_traducao', 'DESC'], ['id_historico', 'DESC']],
        limit: LIMITE_ITENS_PAGINA,
      }),
      exclusoesDoUsuario(req.session.user.id),
    ]);

    return res.render('historico', { bloqueado: false, itens, exclusoes, erroCarregar: false });
  } catch (e) {
    console.error('Erro ao carregar histórico:', e);
    return res.render('historico', { bloqueado: false, itens: [], exclusoes: [], erroCarregar: true });
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

    // id_usuario vem sempre da sessão, nunca do que o navegador envia.
    // Glosa e sequência ficam no registro do usuário: um valor adulterado só afeta o próprio histórico.
    const item = await Historico.create({
      id_usuario: usuario.id,
      id_traducao: traducao.id_traducao,
      glosa,
      sequencia,
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
