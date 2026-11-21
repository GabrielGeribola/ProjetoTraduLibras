const { repassar, ErroApiInterna } = require('../services/apiInterna');
const { limiteDoUsuario } = require('../services/planosService');

// Tradução do /home (texto e voz). O navegador chama estas rotas; o Node descobre o plano de quem está
// usando (visitante = Free), e repassa para a API Python com o limite de tokens do plano. A API conta as
// palavras e responde 413 LIMITE_PLANO se passar do limite (na voz, depois de transcrever).

const TAMANHO_MAXIMO_AUDIO = 5 * 1024 * 1024 + 64 * 1024; // 5 MB de áudio + o envelope do formulário

// Lê o corpo inteiro (o áudio) com teto de tamanho. Precisa ir para a API com tamanho conhecido:
// o servidor da API Python não lê envios "em pedaços" (chunked), e chegaria vazio.
function lerCorpo(req, maximo) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;
    req.on('data', (parte) => {
      total += parte.length;
      if (total > maximo) {
        req.removeAllListeners('data');
        req.resume(); // descarta o resto sem guardar
        resolve(null);
        return;
      }
      partes.push(parte);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function responderErro(res, next, e) {
  if (!(e instanceof ErroApiInterna)) return next(e);
  if (e.codigo === 'SEM_TOKEN') console.error(e.message);
  return res.status(e.status).json({ status: 'error', codigo: e.codigo, mensagem: e.message });
}

exports.texto = async (req, res, next) => {
  // soletrar: palavras sem sinal que a pessoa escolheu soletrar (a API valida)
  const { texto, exclusoes, soletrar } = req.body || {};
  const { limite } = await limiteDoUsuario(req.session.user);
  try {
    const { status, dados } = await repassar('/interno/traduzir', {
      corpo: { texto, exclusoes, soletrar },
      limitePalavras: limite,
    });
    return res.status(status).json(dados);
  } catch (e) {
    return responderErro(res, next, e);
  }
};

exports.voz = async (req, res, next) => {
  const tipo = req.get('content-type') || '';
  if (!tipo.startsWith('multipart/form-data')) {
    return res.status(400).json({ status: 'error', codigo: 'ARQUIVO_AUSENTE', mensagem: 'Nenhum arquivo de áudio enviado.' });
  }
  if (Number(req.get('content-length')) > TAMANHO_MAXIMO_AUDIO) {
    return res.status(413).json({ status: 'error', codigo: 'ARQUIVO_GRANDE', mensagem: 'O áudio é grande demais (máximo de 5 MB).' });
  }
  const corpo = await lerCorpo(req, TAMANHO_MAXIMO_AUDIO).catch(() => null);
  if (!corpo) {
    return res.status(413).json({ status: 'error', codigo: 'ARQUIVO_GRANDE', mensagem: 'O áudio é grande demais (máximo de 5 MB).' });
  }
  const { limite } = await limiteDoUsuario(req.session.user);
  try {
    // O formulário (áudio + exclusões) segue para a API do jeito que chegou, sem ser interpretado aqui
    const { status, dados } = await repassar('/interno/transcrever', {
      corpo,
      tipoConteudo: tipo,
      limitePalavras: limite,
      tempoLimiteMs: 60000,
    });
    return res.status(status).json(dados);
  } catch (e) {
    return responderErro(res, next, e);
  }
};
