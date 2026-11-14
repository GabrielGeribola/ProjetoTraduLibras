const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

exports.middlewareGlobal = (req, res, next) => {
  res.locals.errors = req.flash('errors');
  res.locals.success = req.flash('success');
  // Usado pela navbar ("Sair" e "Histórico") e pela home para saber se há alguém logado
  res.locals.user = req.session.user || null;
  next();
};

// Bloqueia páginas que exigem login (ex.: histórico)
exports.loginRequired = (req, res, next) => {
  if (!req.session.user) {
    req.flash('errors', 'Você precisa fazer login para acessar o histórico.');
    req.session.save(() => res.redirect('/login'));
    return;
  }
  next();
};

// ── Proteção CSRF (double submit cookie) ────────────────────
// Um token aleatório fica num cookie httpOnly e é repetido nos formulários
// (campo _csrf) e nas chamadas fetch (cabeçalho X-CSRF-Token).
// Um site externo não consegue ler o cookie, então não consegue forjar o envio.
const CSRF_COOKIE = 'csrf_token';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

exports.csrfToken = (req, res, next) => {
  let token = req.cookies[CSRF_COOKIE];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  req.csrfTokenAtual = token;
  res.locals.csrfToken = token;
  next();
};

function tokensIguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

exports.csrfProtection = (req, res, next) => {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const enviado = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (req.cookies[CSRF_COOKIE] && tokensIguais(enviado, req.csrfTokenAtual)) return next();

  if (req.is('application/json')) {
    return res.status(403).json({
      status: 'error',
      codigo: 'CSRF_INVALIDO',
      mensagem: 'Sua sessão expirou. Recarregue a página e tente novamente.',
    });
  }
  req.flash('errors', 'Sua sessão expirou. Recarregue a página e tente novamente.');
  return req.session.save(() => res.redirect(req.get('Referrer') || '/'));
};

// ── Limite de tentativas em login e cadastro (força bruta) ──
function limitador(mensagem) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_AUTH) || 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      req.flash('errors', mensagem);
      req.session.save(() => res.redirect(req.originalUrl));
    },
  });
}

exports.limiteLogin = limitador('Muitas tentativas de login. Aguarde 15 minutos e tente novamente.');
exports.limiteCadastro = limitador('Muitas tentativas de cadastro. Aguarde 15 minutos e tente novamente.');
