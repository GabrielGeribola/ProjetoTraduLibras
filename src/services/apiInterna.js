// Chamadas do servidor Node para as rotas internas da API Python (/interno/...).
// Configuração no .env:
//   API_INTERNA_URL  endereço da API vista pelo servidor Node (padrão http://localhost:5000;
//                    no Docker, o nome do serviço, ex.: http://api:5000)
//   TOKEN_INTERNO    o mesmo texto aleatório nos dois serviços (Node e Python)

class ErroApiInterna extends Error {
  constructor(mensagem, codigo = 'API_INTERNA', status = 502) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

const baseUrl = () => (process.env.API_INTERNA_URL || 'http://localhost:5000').replace(/\/+$/, '');

async function chamar(caminho, { metodo = 'GET', corpo, tempoLimiteMs = 30000 } = {}) {
  if (!process.env.TOKEN_INTERNO) {
    throw new ErroApiInterna('TOKEN_INTERNO não está configurado no .env do site e da API.', 'SEM_TOKEN', 503);
  }

  let resposta;
  try {
    resposta = await fetch(`${baseUrl()}${caminho}`, {
      method: metodo,
      headers: {
        'X-Token-Interno': process.env.TOKEN_INTERNO,
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(tempoLimiteMs),
    });
  } catch (e) {
    const tempo = e.name === 'TimeoutError';
    throw new ErroApiInterna(
      tempo ? 'A API de tradução demorou demais para responder.' : 'A API de tradução está fora do ar.',
      tempo ? 'API_LENTA' : 'API_FORA',
      503,
    );
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 403) {
      throw new ErroApiInterna('A API recusou o acesso: o TOKEN_INTERNO do site e da API precisam ser iguais.', 'TOKEN_DIFERENTE', 503);
    }
    if (resposta.status === 404) {
      throw new ErroApiInterna('A API de tradução está desatualizada: reinicie-a com a versão nova.', 'API_DESATUALIZADA', 503);
    }
    throw new ErroApiInterna(dados.mensagem || 'Erro na API de tradução.', dados.codigo || 'API_ERRO', resposta.status);
  }
  return dados;
}

/**
 * Repassa uma tradução do navegador para a API (rotas /interno/traduzir e /interno/transcrever) e
 * devolve { status, dados } como a API respondeu (sucesso, SEM_SINAIS, LIMITE_PLANO...), sem lançar
 * erro por status HTTP. Só lança ErroApiInterna quando a API não pode ser usada (fora do ar, lenta,
 * sem TOKEN_INTERNO). `corpo` é um objeto (vira JSON) ou, com `tipoConteudo`, um Buffer já lido.
 */
async function repassar(caminho, { corpo, tipoConteudo, limitePalavras, tempoLimiteMs = 30000 }) {
  if (!process.env.TOKEN_INTERNO) {
    throw new ErroApiInterna('TOKEN_INTERNO não está configurado no .env do site e da API.', 'SEM_TOKEN', 503);
  }
  const json = !tipoConteudo;
  let resposta;
  try {
    resposta = await fetch(`${baseUrl()}${caminho}`, {
      method: 'POST',
      headers: {
        'X-Token-Interno': process.env.TOKEN_INTERNO,
        'Content-Type': json ? 'application/json' : tipoConteudo,
        ...(limitePalavras ? { 'X-Limite-Palavras': String(limitePalavras) } : {}),
      },
      body: json ? JSON.stringify(corpo) : corpo,
      signal: AbortSignal.timeout(tempoLimiteMs),
    });
  } catch (e) {
    const tempo = e.name === 'TimeoutError';
    throw new ErroApiInterna(
      tempo ? 'A tradução está demorando mais que o normal. Tente novamente em instantes.' : 'O serviço de tradução está fora do ar.',
      tempo ? 'API_LENTA' : 'API_FORA',
      503,
    );
  }
  if (resposta.status === 403) {
    console.error('A API recusou o acesso: o TOKEN_INTERNO do site e da API precisam ser iguais.');
    throw new ErroApiInterna('O serviço de tradução está com problemas agora.', 'TOKEN_DIFERENTE', 503);
  }
  const dados = await resposta.json().catch(() => null);
  if (!dados) throw new ErroApiInterna('O serviço de tradução está com problemas agora.', 'API_ERRO', 502);
  return { status: resposta.status, dados };
}

const status = () => chamar('/interno/status', { tempoLimiteMs: 5000 });

const listarVideosS3 = () => chamar('/interno/s3/videos', { tempoLimiteMs: 180000 });

const sugerirDescricoes = async (nomes) => (await chamar('/interno/descricoes', {
  metodo: 'POST', corpo: { nomes }, tempoLimiteMs: 60000,
})).descricoes;

/** Vetores para a coluna words_sl_br.embedding (em lotes; o primeiro uso carrega o modelo) */
async function gerarEmbeddings(textos) {
  const vetores = [];
  for (let i = 0; i < textos.length; i += 500) {
    const { vetores: parte } = await chamar('/interno/embeddings', {
      metodo: 'POST', corpo: { textos: textos.slice(i, i + 500) }, tempoLimiteMs: 120000,
    });
    vetores.push(...parte);
  }
  return vetores;
}

/** Pede para a API recarregar os sinais do banco. Não bloqueia: se falhar, a API recarrega sozinha em até 1 hora. */
function pedirRecarga() {
  return chamar('/interno/recarregar', { metodo: 'POST', tempoLimiteMs: 5000 })
    .then(() => true)
    .catch((e) => {
      console.error('Não foi possível pedir a recarga dos sinais à API:', e.message);
      return false;
    });
}

module.exports = { ErroApiInterna, repassar, status, listarVideosS3, sugerirDescricoes, gerarEmbeddings, pedirRecarga };
