const dns = require('dns').promises;
const validator = require('validator');

// Validação do domínio do e-mail no cadastro (primeira barreira; a confirmação por link é a garantia).
// Recusa:
//   - formato inválido;
//   - domínios reservados para exemplos e testes (example.com, *.test, *.invalid, *.localhost...);
//   - caixas descartáveis conhecidas (mailinator, yopmail...);
//   - domínios que não existem ou não recebem e-mail (sem registro MX, ou MX "nulo").
// Atenção: domínios como teste.com e exemplo.com existem e recebem e-mail; só o link de confirmação
// prova que o endereço é de quem se cadastrou.
// Se o DNS não responder (fora do ar, lento), o cadastro NÃO é bloqueado: a confirmação por link segue valendo.

const TLDS_RESERVADOS = new Set(['test', 'invalid', 'example', 'localhost', 'local', 'internal', 'lan']);
const DOMINIOS_RESERVADOS = new Set(['example.com', 'example.net', 'example.org']);

// Caixas de e-mail temporárias/descartáveis mais comuns
const DESCARTAVEIS = new Set([
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
  'grr.la', '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net',
  'tempail.com', 'throwawaymail.com', 'trashmail.com', 'trashmail.de', 'getnada.com', 'nada.email',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'fakeinbox.com', 'emailondeck.com',
  'mohmal.com', 'mailcatch.com', 'spamgourmet.com', 'mytemp.email', 'tempr.email', 'discard.email',
  'moakt.com', 'burnermail.io', 'inboxkitten.com', 'mailpoof.com', 'emailfake.com', 'fakemail.net',
]);

const TEMPO_DNS_MS = 4000;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // domínio -> { valido, motivo, em }

const MENSAGENS = {
  formato: 'Digite um e-mail válido.',
  reservado: 'Esse domínio é reservado para exemplos e testes. Use um e-mail de verdade.',
  descartavel: 'E-mails temporários não são aceitos. Use um e-mail que você continue acessando.',
  sem_email: 'Esse domínio não recebe e-mails. Confira se o endereço está certo.',
};

function comTempoLimite(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => { setTimeout(() => rejeitar(Object.assign(new Error('tempo'), { code: 'TEMPO' })), ms); }),
  ]);
}

// Devolve { valido, definitivo }: "definitivo" = o DNS respondeu (pode ir para o cache)
async function recebeEmail(dominio) {
  try {
    const registros = await comTempoLimite(dns.resolveMx(dominio), TEMPO_DNS_MS);
    // MX "nulo" (RFC 7505: prioridade 0 e destino "." ou vazio) = o domínio declara que não recebe e-mail
    return { valido: registros.some((r) => r.exchange && r.exchange !== '.'), definitivo: true };
  } catch (e) {
    if (['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(e.code)) return { valido: false, definitivo: true };
    console.warn(`DNS indisponível ao validar o domínio ${dominio} (${e.code || e.message}); cadastro não bloqueado.`);
    return { valido: true, definitivo: false }; // falha do DNS não é culpa de quem está se cadastrando
  }
}

/** Devolve { valido: true } ou { valido: false, motivo, mensagem } */
async function validarEmail(email) {
  const texto = typeof email === 'string' ? email.trim() : '';
  if (!validator.isEmail(texto)) return { valido: false, motivo: 'formato', mensagem: MENSAGENS.formato };

  const dominio = texto.split('@').pop().toLowerCase().replace(/\.$/, '');
  const tld = dominio.split('.').pop();
  if (TLDS_RESERVADOS.has(tld) || DOMINIOS_RESERVADOS.has(dominio)) {
    return { valido: false, motivo: 'reservado', mensagem: MENSAGENS.reservado };
  }
  if (DESCARTAVEIS.has(dominio)) return { valido: false, motivo: 'descartavel', mensagem: MENSAGENS.descartavel };

  const guardado = cache.get(dominio);
  if (guardado && Date.now() - guardado.em < CACHE_MS) {
    return guardado.valido ? { valido: true } : { valido: false, motivo: 'sem_email', mensagem: MENSAGENS.sem_email };
  }
  const { valido, definitivo } = await recebeEmail(dominio);
  if (definitivo) cache.set(dominio, { valido, em: Date.now() });
  return valido ? { valido: true } : { valido: false, motivo: 'sem_email', mensagem: MENSAGENS.sem_email };
}

module.exports = { validarEmail };
