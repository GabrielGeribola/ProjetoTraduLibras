// Importar do S3: compara os vídeos dos buckets com o banco e mostra os novos para aprovação.
// Aprovar = cadastrar o vídeo (animation_sl_br) + a palavra (words_sl_br) com a embedding, de uma vez.
// Excluir = não cadastrar (o arquivo continua no S3 e não volta nas próximas varreduras).
const { consultar, umaLinha, executar, transacao } = require('../../config/consulta');
const apiInterna = require('../../services/apiInterna');
const { registrar } = require('../../services/auditoria');
const sinais = require('../../services/sinaisService');
const {
  texto, ids, like, descricaoSinal, paginacao, voltar, destinoAdmin, urlCom,
} = require('./util');

const POR_PAGINA = 50;
const LIMITE_POR_VEZ = 1000;   // aprovações por clique (o resto fica para o próximo)
const STATUS = { pendente: 'Para aprovar', rejeitado: 'Excluídos', aprovado: 'Aprovados' };
const SINALIZACOES = {
  nova: 'Palavra nova',
  existe: 'Já tem sinal (vídeo alternativo)',
  revisar: 'Revisar o nome',
};

// Nome "bom": só letras, separadas por espaço, vírgula ou hífen ("café da manhã", "guarda-chuva")
const PADRAO_NOME = '^\\p{L}+([ ,-]+\\p{L}+)*$';
const NOME_BOM = /^\p{L}+([ ,-]+\p{L}+)*$/u;
const EXISTE = 'EXISTS (SELECT 1 FROM words_sl_br w WHERE w.description = i.descricao_sugerida)';
const REPETICOES = "(SELECT COUNT(*) FROM importacao_s3 j WHERE j.status = 'pendente' AND j.descricao_sugerida = i.descricao_sugerida)";
const REVISAR = `(i.descricao_sugerida = '' OR CHAR_LENGTH(i.descricao_sugerida) > 60
                  OR NOT REGEXP_LIKE(i.descricao_sugerida, :padraoNome) OR ${REPETICOES} > 1)`;

function motivosRevisar(descricao, repeticoes) {
  const motivos = [];
  if (!descricao) motivos.push('sem nome');
  else {
    if (/\d/.test(descricao)) motivos.push('tem números');
    else if (!NOME_BOM.test(descricao)) motivos.push('caracteres estranhos');
    if (descricao.length > 60) motivos.push('nome longo');
  }
  if (Number(repeticoes) > 1) motivos.push(`${repeticoes} vídeos com esse nome na lista`);
  return motivos;
}

function lerFiltros(origem) {
  return {
    status: STATUS[origem.status] ? origem.status : 'pendente',
    q: texto(origem.q, 100),
    bucket: texto(origem.bucket, 63),
    sinal: SINALIZACOES[origem.sinal] ? origem.sinal : '',
  };
}

function filtroSql(f) {
  const where = ['i.status = :status'];
  const p = { status: f.status, padraoNome: PADRAO_NOME };
  if (f.q) { where.push('(i.descricao_sugerida LIKE :q OR i.chave LIKE :q)'); p.q = like(f.q); }
  if (f.bucket) { where.push('i.bucket = :bucket'); p.bucket = f.bucket; }
  if (f.sinal === 'revisar') where.push(REVISAR);
  if (f.sinal === 'existe') where.push(`${EXISTE} AND NOT ${REVISAR}`);
  if (f.sinal === 'nova') where.push(`NOT ${EXISTE} AND NOT ${REVISAR}`);
  return { where: where.join(' AND '), p };
}

// GET /admin/s3
exports.index = async (req, res) => {
  const filtros = lerFiltros(req.query);
  const { where, p } = filtroSql(filtros);

  const { total } = await umaLinha(`SELECT COUNT(*) AS total FROM importacao_s3 i WHERE ${where}`, p);
  const pag = paginacao(req, total, POR_PAGINA);
  const itens = await consultar(`
    SELECT i.id_importacao, i.bucket, i.chave, i.url, i.descricao_sugerida, i.tamanho, i.modificado_em,
           i.status, i.id_animation, i.decidido_em, i.encontrado_em,
           ${EXISTE} AS existe, ${REPETICOES} AS repeticoes,
           (SELECT GROUP_CONCAT(w.description SEPARATOR ' · ') FROM words_sl_br w WHERE w.id_animation = i.id_animation) AS palavras,
           (SELECT u.email FROM Usuarios_testes u WHERE u.id = i.decidido_por) AS decidido_por
      FROM importacao_s3 i
     WHERE ${where}
     ORDER BY ${filtros.status === 'pendente' ? 'i.descricao_sugerida, i.id_importacao' : 'i.decidido_em DESC, i.id_importacao DESC'}
     LIMIT :limite OFFSET :offset`, { ...p, limite: POR_PAGINA, offset: pag.offset });

  const [contagens, buckets, varredura, api] = await Promise.all([
    consultar('SELECT status, COUNT(*) AS total FROM importacao_s3 GROUP BY status'),
    consultar('SELECT DISTINCT bucket FROM importacao_s3 ORDER BY bucket'),
    umaLinha('SELECT * FROM importacao_s3_varreduras ORDER BY id_varredura DESC LIMIT 1'),
    apiInterna.status().then((s) => ({ online: true, ...s })).catch((e) => ({ online: false, erro: e.message })),
  ]);

  // Vídeos do banco que a última varredura não achou no S3 (só os que ainda estão no banco)
  let ausentes = [];
  if (varredura?.ausentes) {
    const lista = typeof varredura.ausentes === 'string' ? JSON.parse(varredura.ausentes) : varredura.ausentes;
    if (lista.length) {
      const aindaNoBanco = new Set((await consultar(
        'SELECT id_animation FROM animation_sl_br WHERE id_animation IN (:ids)',
        { ids: lista.map((a) => a.id_animation) },
      )).map((a) => a.id_animation));
      ausentes = lista.filter((a) => aindaNoBanco.has(a.id_animation));
    }
  }

  res.render('admin/s3', {
    titulo: 'Importar do S3', secao: 's3',
    itens: itens.map((i) => ({ ...i, motivos: i.status === 'aprovado' ? [] : motivosRevisar(i.descricao_sugerida, i.repeticoes) })),
    filtros, pag, total, statusLista: STATUS, sinalizacoes: SINALIZACOES,
    contagens: Object.fromEntries(contagens.map((c) => [c.status, Number(c.total)])),
    buckets: buckets.map((b) => b.bucket), varredura, ausentes, api,
    linkStatus: (status) => urlCom(req, { status, pagina: 1, sinal: '' }),
    limitePorVez: LIMITE_POR_VEZ,
  });
};

// POST /admin/s3/varrer — lista os buckets e guarda os vídeos novos como "para aprovar"
exports.varrer = async (req, res) => {
  let s3;
  try {
    s3 = await apiInterna.listarVideosS3();
  } catch (e) {
    if (e instanceof apiInterna.ErroApiInterna) return voltar(req, res, '/admin/s3', 'errors', `Varredura não concluída. ${e.message}`);
    throw e;
  }

  const noBanco = await consultar(`
    SELECT a.id_animation, a.url, GROUP_CONCAT(w.description ORDER BY w.id_word SEPARATOR ', ') AS palavras
      FROM animation_sl_br a LEFT JOIN words_sl_br w ON w.id_animation = a.id_animation
     GROUP BY a.id_animation, a.url`);
  const urlsBanco = new Set(noBanco.map((v) => v.url));
  const urlsS3 = new Set(s3.videos.map((v) => v.url));

  // Vídeos do banco (dos buckets varridos) que não existem mais no S3
  const prefixos = s3.buckets.map((b) => `https://${b}.s3.`);
  const doBucket = noBanco.filter((v) => prefixos.some((pr) => v.url.startsWith(pr)));
  const ausentes = doBucket.filter((v) => !urlsS3.has(v.url))
    .map((v) => ({ id_animation: v.id_animation, url: v.url, palavras: v.palavras || '' }));

  // Trava de segurança: se quase nada bate, o problema é de configuração (região/bucket), não de vídeos
  if (doBucket.length > 50 && ausentes.length > doBucket.length / 2) {
    return voltar(req, res, '/admin/s3', 'errors',
      `A varredura não bate com o banco (${ausentes.length} de ${doBucket.length} vídeos não foram achados). `
      + 'Nada foi alterado. Confira AWS_REGION e S3_BUCKETS no .env da API.');
  }

  const novos = s3.videos.filter((v) => !urlsBanco.has(v.url));
  const longos = novos.filter((v) => v.url.length > 255);
  const validos = novos.filter((v) => v.url.length <= 255);

  let inseridos = 0;
  for (let i = 0; i < validos.length; i += 300) {
    const lote = validos.slice(i, i + 300);
    const p = {};
    const valores = lote.map((v, j) => {
      Object.assign(p, {
        [`b${j}`]: v.bucket, [`c${j}`]: v.chave.slice(0, 500), [`u${j}`]: v.url,
        [`d${j}`]: descricaoSinal(v.descricao_sugerida), [`t${j}`]: v.tamanho ?? null, [`m${j}`]: v.modificado_em ?? null,
      });
      return `(:b${j}, :c${j}, :u${j}, :d${j}, :t${j}, :m${j})`;
    });
    // IGNORE: o que já está na lista (pendente, aprovado ou excluído) continua como está
    inseridos += (await executar(`
      INSERT IGNORE INTO importacao_s3 (bucket, chave, url, descricao_sugerida, tamanho, modificado_em)
      VALUES ${valores.join(', ')}`, p)).linhas;
  }

  // Arrumação da lista: pendentes que já entraram no banco por outro caminho, e pendentes que saíram do S3
  await executar(`
    UPDATE importacao_s3 i JOIN animation_sl_br a ON a.url COLLATE utf8mb4_bin = i.url
       SET i.status = 'aprovado', i.id_animation = a.id_animation, i.decidido_em = NOW()
     WHERE i.status = 'pendente'`);
  const pendentes = await consultar("SELECT id_importacao, url FROM importacao_s3 WHERE status = 'pendente' AND bucket IN (:buckets)",
    { buckets: s3.buckets });
  const sumiram = pendentes.filter((p) => !urlsS3.has(p.url)).map((p) => p.id_importacao);
  if (sumiram.length) await executar('DELETE FROM importacao_s3 WHERE id_importacao IN (:ids)', { ids: sumiram });

  const resumo = {
    buckets: s3.buckets.join(', '),
    total_s3: s3.videos.length,
    ja_cadastrados: s3.videos.length - novos.length,
    novos: inseridos,
    ignorados: (s3.ignorados || 0) + longos.length,
  };
  await executar(`
    INSERT INTO importacao_s3_varreduras (id_usuario, buckets, total_s3, ja_cadastrados, novos, ignorados, ausentes)
    VALUES (:id, :buckets, :total_s3, :ja_cadastrados, :novos, :ignorados, :ausentes)`,
  { id: req.admin.id, ...resumo, ausentes: JSON.stringify(ausentes.slice(0, 2000)) });
  await registrar(req, 's3.varrer', { ...resumo, ausentes: ausentes.length });

  const { total: pendentesAgora } = await umaLinha("SELECT COUNT(*) AS total FROM importacao_s3 WHERE status = 'pendente'");
  const partes = [
    `Varredura concluída: ${resumo.total_s3} vídeos no S3, ${resumo.ja_cadastrados} já cadastrados.`,
    inseridos ? `${inseridos} novos entraram na lista para aprovar.` : 'Nenhum vídeo novo.',
    `Para aprovar agora: ${pendentesAgora}.`,
  ];
  if (ausentes.length) partes.push(`${ausentes.length} vídeos do banco não estão mais no S3 (veja no fim da página).`);
  if (longos.length) partes.push(`${longos.length} arquivos com nome longo demais foram ignorados.`);
  return voltar(req, res, '/admin/s3', 'success', partes.join(' '));
};

async function idsDoFiltro(filtros) {
  const { where, p } = filtroSql({ ...filtros, status: 'pendente' });
  const linhas = await consultar(`SELECT i.id_importacao FROM importacao_s3 i WHERE ${where}
                                   ORDER BY i.descricao_sugerida, i.id_importacao LIMIT :limite`,
  { ...p, limite: LIMITE_POR_VEZ + 1 });
  return linhas.map((l) => l.id_importacao);
}

async function aprovar(req, res, alvo, destino) {
  const editadas = req.body.descricao && typeof req.body.descricao === 'object' ? req.body.descricao : {};
  const linhas = await consultar(`
    SELECT id_importacao, url, descricao_sugerida FROM importacao_s3
     WHERE id_importacao IN (:ids) AND status = 'pendente'`, { ids: alvo.slice(0, LIMITE_POR_VEZ) });
  if (!linhas.length) return voltar(req, res, destino, 'errors', 'Esses vídeos já não estão mais na lista para aprovar.');

  // Campos da tela: descricao[i123] (com letra: chave só numérica vira lista no parser do formulário)
  const itens = linhas.map((l) => {
    const editada = editadas[`i${l.id_importacao}`];
    return {
      id: l.id_importacao,
      url: l.url,
      descricao: descricaoSinal(typeof editada === 'string' ? editada : l.descricao_sugerida),
    };
  });
  const semNome = itens.filter((i) => !i.descricao);
  let validos = itens.filter((i) => i.descricao);

  // Se alguém cadastrou o mesmo vídeo no meio tempo, só liga a lista ao que já existe
  const jaNoBanco = new Map((await consultar(
    'SELECT id_animation, url FROM animation_sl_br WHERE url COLLATE utf8mb4_bin IN (:urls)',
    { urls: itens.map((i) => i.url) },
  )).map((a) => [a.url, a.id_animation]));
  const ligarExistentes = validos.filter((i) => jaNoBanco.has(i.url));
  validos = validos.filter((i) => !jaNoBanco.has(i.url));

  let vetores = new Map();
  if (validos.length) {
    try {
      vetores = await sinais.embeddingsPorDescricao(validos.map((i) => i.descricao));
    } catch (e) {
      if (e instanceof apiInterna.ErroApiInterna) {
        return voltar(req, res, destino, 'errors', `Nada foi cadastrado: não foi possível gerar as embeddings. ${e.message}`);
      }
      throw e;
    }
  }

  await transacao(async (transaction) => {
    const mapa = validos.length ? await sinais.cadastrarVideos(validos, vetores, { transaction }) : new Map();
    for (const i of ligarExistentes) mapa.set(i.url, jaNoBanco.get(i.url));
    const decididos = [...validos, ...ligarExistentes];
    for (let k = 0; k < decididos.length; k += 200) {
      const lote = decididos.slice(k, k + 200);
      const p = { admin: req.admin.id, ids: lote.map((i) => i.id) };
      const casosAnim = [];
      const casosDesc = [];
      lote.forEach((item, j) => {
        p[`i${j}`] = item.id; p[`a${j}`] = mapa.get(item.url); p[`d${j}`] = item.descricao;
        casosAnim.push(`WHEN :i${j} THEN :a${j}`);
        casosDesc.push(`WHEN :i${j} THEN :d${j}`);
      });
      await executar(`
        UPDATE importacao_s3
           SET status = 'aprovado', decidido_por = :admin, decidido_em = NOW(),
               id_animation = CASE id_importacao ${casosAnim.join(' ')} END,
               descricao_sugerida = CASE id_importacao ${casosDesc.join(' ')} END
         WHERE id_importacao IN (:ids)`, p, { transaction });
    }
  });

  await registrar(req, 's3.aprovar', {
    total: validos.length, ja_existiam: ligarExistentes.length,
    palavras: validos.slice(0, 30).map((i) => i.descricao),
  });
  if (validos.length) apiInterna.pedirRecarga();

  const partes = [`${validos.length} vídeo(s) cadastrado(s) com palavra e embedding. O tradutor atualiza em alguns segundos.`];
  if (ligarExistentes.length) partes.push(`${ligarExistentes.length} já estavam no banco e saíram da lista.`);
  if (semNome.length) partes.push(`${semNome.length} ficaram na lista porque estão sem nome: preencha a palavra e aprove de novo.`);
  if (alvo.length > LIMITE_POR_VEZ) partes.push(`Ainda há vídeos no filtro: clique em "Aprovar todos" de novo para continuar (${LIMITE_POR_VEZ} por vez).`);
  return voltar(req, res, destino, 'success', partes.join(' '));
}

// POST /admin/s3/decidir — aprovar / excluir / restaurar (um, os marcados ou todos do filtro)
exports.decidir = async (req, res) => {
  const destino = destinoAdmin(req.body.voltar, '/admin/s3');
  const pedido = texto(req.body.acao, 40);

  let acao;
  let alvo;
  const um = pedido.match(/^(aprovar|rejeitar|restaurar):(\d+)$/);
  if (um) {
    [, acao] = um;
    alvo = [Number(um[2])];
  } else if (/^(aprovar|rejeitar|restaurar)_selecionados$/.test(pedido)) {
    acao = pedido.replace('_selecionados', '');
    alvo = ids(req.body.ids);
    if (!alvo.length) return voltar(req, res, destino, 'errors', 'Marque pelo menos um vídeo.');
  } else if (pedido === 'aprovar_todos') {
    acao = 'aprovar';
    alvo = await idsDoFiltro(lerFiltros({
      q: req.body.filtro_q, bucket: req.body.filtro_bucket, sinal: req.body.filtro_sinal,
    }));
    if (!alvo.length) return voltar(req, res, destino, 'errors', 'Não há vídeos para aprovar com esse filtro.');
  } else {
    return voltar(req, res, destino, 'errors', 'Ação inválida.');
  }

  if (acao === 'aprovar') return aprovar(req, res, alvo, destino);

  const [de, para] = acao === 'rejeitar' ? ['pendente', 'rejeitado'] : ['rejeitado', 'pendente'];
  const { linhas } = await executar(`
    UPDATE importacao_s3 SET status = :para, decidido_por = :admin, decidido_em = NOW()
     WHERE id_importacao IN (:ids) AND status = :de`, { ids: alvo, de, para, admin: req.admin.id });
  await registrar(req, acao === 'rejeitar' ? 's3.excluir' : 's3.restaurar', { total: linhas, ids: alvo.slice(0, 50) });
  return voltar(req, res, destino, 'success', acao === 'rejeitar'
    ? `${linhas} vídeo(s) excluído(s) da lista. Eles não serão cadastrados e ficam na aba "Excluídos".`
    : `${linhas} vídeo(s) voltaram para a lista de aprovação.`);
};

// POST /admin/s3/ausentes/:id/remover — tira do banco um vídeo que não existe mais no S3
exports.removerAusente = async (req, res) => {
  const idAnimation = Number(req.params.id);
  const removido = await transacao((transaction) => sinais.removerVideo(idAnimation, req.admin.id, { transaction }));
  if (!removido) return voltar(req, res, '/admin/s3', 'errors', 'Esse vídeo já não está no banco.');
  await registrar(req, 's3.remover_ausente', removido);
  apiInterna.pedirRecarga();
  return voltar(req, res, '/admin/s3', 'success',
    `Vídeo removido do banco${removido.palavras.length ? ` (palavras: ${removido.palavras.join(', ')})` : ''}.`);
};
