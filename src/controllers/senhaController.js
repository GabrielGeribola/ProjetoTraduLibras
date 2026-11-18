const crypto = require('crypto');
const { Op } = require('sequelize');
const validator = require('validator');
const bcryptjs = require('bcryptjs');
const sequelize = require('../config/database');
const User = require('../models/UserModel');
const RedefinicaoSenha = require('../models/RedefinicaoSenhaModel');
const { enviarEmail } = require('../services/emailService');

const VALIDADE_MS = 60 * 60 * 1000; // link vale 1 hora
const SENHA_MINIMA = 10;            // mesma regra do cadastro
const MENSAGEM_ENVIO = 'Se esse e-mail estiver cadastrado, você vai receber um link para criar uma nova senha. Ele vale por 1 hora. Confira também a caixa de spam.';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const tokenComFormatoValido = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

// Endereço usado no link do e-mail. Vem do .env (APP_URL), nunca do cabeçalho Host da requisição,
// para que ninguém consiga gerar um e-mail legítimo apontando para outro site.
function urlBase() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') return null;
  return `http://localhost:${process.env.PORT || 3000}`;
}

// Token válido = existe, não foi usado e não venceu
async function buscarPedidoValido(token) {
  if (!tokenComFormatoValido(token)) return null;
  return RedefinicaoSenha.findOne({
    where: { token_hash: hashToken(token), usado_em: null, expira_em: { [Op.gt]: new Date() } },
  });
}

async function enviarLink(usuario) {
  const base = urlBase();
  if (!base) {
    console.error('APP_URL não configurada: o link de redefinição de senha não foi enviado.');
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  await sequelize.transaction(async (transaction) => {
    // Só o link mais recente funciona
    await RedefinicaoSenha.update(
      { usado_em: new Date() },
      { where: { id_usuario: usuario.id, usado_em: null }, transaction },
    );
    await RedefinicaoSenha.create({
      id_usuario: usuario.id,
      token_hash: hashToken(token),
      expira_em: new Date(Date.now() + VALIDADE_MS),
    }, { transaction });
  });

  const link = `${base}/redefinir-senha/${token}`;
  await enviarEmail({
    para: usuario.email,
    assunto: 'TraduLibras: redefinição de senha',
    texto: [
      'Olá!',
      '',
      'Recebemos um pedido para redefinir a senha da sua conta no TraduLibras.',
      `Para criar uma nova senha, acesse: ${link}`,
      '',
      'O link vale por 1 hora e só pode ser usado uma vez.',
      'Se você não fez esse pedido, ignore este e-mail: sua senha continua a mesma.',
    ].join('\n'),
    html: `
      <p>Olá!</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta no <strong>TraduLibras</strong>.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#f49340;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>
      <p>Ou copie este endereço no navegador:<br>${link}</p>
      <p>O link vale por 1 hora e só pode ser usado uma vez.<br>Se você não fez esse pedido, ignore este e-mail: sua senha continua a mesma.</p>
    `,
  });
}

// Também usado pela administração (criar conta e "enviar link para criar senha")
exports.enviarLink = enviarLink;

// GET /esqueci-senha
exports.esqueciPage = (req, res) => res.render('esqueci-senha', { enviado: false });

// POST /esqueci-senha — a resposta é sempre a mesma, exista ou não o e-mail (não revela quem tem conta)
exports.esqueci = async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  if (!validator.isEmail(email)) {
    req.flash('errors', 'Digite um e-mail válido.');
    return req.session.save(() => res.redirect('/esqueci-senha'));
  }

  try {
    const usuario = await User.findOne({ attributes: ['id', 'email'], where: { email } });
    if (usuario) {
      // Envio em segundo plano: o tempo de resposta não indica se o e-mail existe
      enviarLink(usuario).catch((e) => console.error('Erro ao enviar link de redefinição de senha:', e));
    }
  } catch (e) {
    console.error('Erro ao processar "esqueci a senha":', e);
  }

  return res.render('esqueci-senha', { enviado: true, mensagem: MENSAGEM_ENVIO });
};

// GET /redefinir-senha/:token
exports.redefinirPage = async (req, res) => {
  try {
    const pedido = await buscarPedidoValido(req.params.token);
    return res.render('redefinir-senha', { tokenValido: Boolean(pedido), token: req.params.token });
  } catch (e) {
    console.error('Erro ao validar link de redefinição:', e);
    return res.render('redefinir-senha', { tokenValido: false, token: '' });
  }
};

// POST /redefinir-senha/:token
exports.redefinir = async (req, res) => {
  const { token } = req.params;
  const senha = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmacao = typeof req.body.confirmacao === 'string' ? req.body.confirmacao : '';

  const erros = [];
  if (senha.length < SENHA_MINIMA) erros.push(`A senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.`);
  if (senha !== confirmacao) erros.push('As senhas não são iguais.');

  try {
    const pedido = await buscarPedidoValido(token);
    if (!pedido) return res.render('redefinir-senha', { tokenValido: false, token: '' });

    if (erros.length > 0) {
      req.flash('errors', erros);
      return req.session.save(() => res.redirect(`/redefinir-senha/${encodeURIComponent(token)}`));
    }

    const hash = bcryptjs.hashSync(senha, bcryptjs.genSaltSync());
    await sequelize.transaction(async (transaction) => {
      // Marca como usado só se ainda não foi (evita usar o mesmo link duas vezes ao mesmo tempo)
      const [usados] = await RedefinicaoSenha.update(
        { usado_em: new Date() },
        { where: { id: pedido.id, usado_em: null }, transaction },
      );
      if (usados !== 1) throw new Error('LINK_JA_USADO');

      await User.update({ password: hash }, { where: { id: pedido.id_usuario }, transaction });

      // Encerra as sessões abertas dessa conta (ex.: alguém que estava usando a senha antiga)
      await sequelize.query(
        "DELETE FROM `session` WHERE JSON_VALID(`data`) AND JSON_EXTRACT(`data`, '$.user.id') = ?",
        { replacements: [pedido.id_usuario], transaction },
      );
    });

    // Se quem redefiniu estava logado nesta mesma conta, a sessão dele também acabou
    if (req.session.user && req.session.user.id === pedido.id_usuario) delete req.session.user;

    req.flash('success', 'Senha alterada com sucesso. Entre com a nova senha.');
    return req.session.save(() => res.redirect('/login'));
  } catch (e) {
    if (e.message === 'LINK_JA_USADO') return res.render('redefinir-senha', { tokenValido: false, token: '' });
    console.error('Erro ao redefinir senha:', e);
    req.flash('errors', 'Não foi possível alterar a senha agora. Tente novamente.');
    return req.session.save(() => res.redirect(`/redefinir-senha/${encodeURIComponent(token)}`));
  }
};
