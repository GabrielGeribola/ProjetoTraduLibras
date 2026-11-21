const crypto = require('crypto');
const validator = require('validator');
const { consultar, umaLinha, executar, transacao } = require('../config/consulta');
const { enviarEmail } = require('../services/emailService');
const { urlBase, conferirBase, hashToken, tokenComFormatoValido } = require('./senhaController');

// Confirmação de e-mail do cadastro. A conta nasce com email_pendente = 1 e só entra depois de
// clicar no link enviado por e-mail (vale 24 horas; só o mais recente funciona). Abrir um link de
// "Esqueci a senha" também confirma (prova a mesma coisa: a pessoa recebe e-mails nesse endereço).
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const MENSAGEM_REENVIO = 'Se houver um cadastro esperando confirmação com esse e-mail, enviamos um novo link. Confira também a caixa de spam.';

/** Envia (ou reenvia) o link de confirmação. Lança erro se não for possível enviar. */
async function enviarConfirmacao(usuario, { hostAcesso } = {}) {
  const base = urlBase();
  conferirBase(base, hostAcesso); // APP_URL ausente ou em localhost no servidor: não envia link quebrado

  const token = crypto.randomBytes(32).toString('hex');
  await transacao(async (transaction) => {
    await executar('UPDATE confirmacao_email SET usado_em = NOW() WHERE id_usuario = :id AND usado_em IS NULL',
      { id: usuario.id }, { transaction });
    await executar(`INSERT INTO confirmacao_email (id_usuario, token_hash, expira_em)
                    VALUES (:id, :hash, :expira)`,
    { id: usuario.id, hash: hashToken(token), expira: new Date(Date.now() + VALIDADE_MS) }, { transaction });
  });

  const link = `${base}/confirmar-email/${token}`;
  await enviarEmail({
    para: usuario.email,
    assunto: 'TraduLibras: confirme seu e-mail',
    texto: [
      'Olá!',
      '',
      'Falta só um passo para ativar sua conta no TraduLibras.',
      `Para confirmar seu e-mail, acesse: ${link}`,
      '',
      'O link vale por 24 horas. Se você não se cadastrou, ignore este e-mail.',
    ].join('\n'),
    html: `
      <p>Olá!</p>
      <p>Falta só um passo para ativar sua conta no <strong>TraduLibras</strong>.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#f49340;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar meu e-mail</a></p>
      <p>Ou copie este endereço no navegador:<br>${link}</p>
      <p>O link vale por 24 horas. Se você não se cadastrou, ignore este e-mail.</p>
    `,
  });
}
exports.enviarConfirmacao = enviarConfirmacao;

// GET /confirmar-email/:token
exports.confirmar = async (req, res) => {
  const { token } = req.params;
  try {
    const pedido = tokenComFormatoValido(token) ? await umaLinha(`
      SELECT id, id_usuario FROM confirmacao_email
       WHERE token_hash = :hash AND usado_em IS NULL AND expira_em > :agora`, { hash: hashToken(token), agora: new Date() }) : null;

    if (!pedido) {
      req.flash('errors', 'Esse link de confirmação é inválido ou já venceu. Peça um novo abaixo.');
      return req.session.save(() => res.redirect('/login?reenviar=1'));
    }

    await transacao(async (transaction) => {
      await executar('UPDATE confirmacao_email SET usado_em = NOW() WHERE id = :id AND usado_em IS NULL', { id: pedido.id }, { transaction });
      await executar('UPDATE Usuarios_testes SET email_pendente = 0 WHERE id = :id', { id: pedido.id_usuario }, { transaction });
    });
    req.flash('success', 'E-mail confirmado! Agora é só entrar.');
    return req.session.save(() => res.redirect('/login'));
  } catch (e) {
    console.error('Erro ao confirmar e-mail:', e);
    req.flash('errors', 'Não foi possível confirmar agora. Tente o link de novo em instantes.');
    return req.session.save(() => res.redirect('/login'));
  }
};

// POST /confirmar-email/reenviar — resposta sempre igual (não revela quais e-mails têm cadastro)
exports.reenviar = async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  if (!validator.isEmail(email)) {
    req.flash('errors', 'Digite um e-mail válido.');
    return req.session.save(() => res.redirect('/login?reenviar=1'));
  }
  try {
    const [usuario] = await consultar('SELECT id, email FROM Usuarios_testes WHERE email = :email AND email_pendente = 1', { email });
    if (usuario) {
      enviarConfirmacao(usuario, { hostAcesso: req.get('host') })
        .catch((e) => console.error('Erro ao reenviar a confirmação de e-mail:', e.message));
    }
  } catch (e) {
    console.error('Erro ao processar o reenvio da confirmação:', e);
  }
  req.flash('success', MENSAGEM_REENVIO);
  return req.session.save(() => res.redirect('/login'));
};
