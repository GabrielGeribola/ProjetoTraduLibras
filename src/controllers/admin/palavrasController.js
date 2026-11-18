const { consultar, umaLinha, executar, transacao } = require('../../config/consulta');
const apiInterna = require('../../services/apiInterna');
const { registrar } = require('../../services/auditoria');
const sinais = require('../../services/sinaisService');
const {
  texto, inteiro, like, descricaoSinal, paginacao, voltar, destinoAdmin,
} = require('./util');

const POR_PAGINA = 50;
const SITUACOES = {
  sem_embedding: 'Sem embedding',
  video_varias: 'Vídeo com mais de uma palavra',
  repetidas: 'Palavra com mais de um vídeo',
};

const bucketDaUrl = (url) => (String(url).match(/^https:\/\/([^.]+)\.s3\./) || [])[1] || '';

// GET /admin/palavras
exports.lista = async (req, res) => {
  const filtros = {
    q: texto(req.query.q, 100),
    bucket: texto(req.query.bucket, 63),
    situacao: SITUACOES[req.query.situacao] ? req.query.situacao : '',
    video: inteiro(req.query.video) || '',
    associar: descricaoSinal(req.query.associar),
  };

  const where = ['1 = 1'];
  const p = {};
  if (filtros.q) { where.push('w.description LIKE :q'); p.q = like(filtros.q); }
  if (filtros.bucket) { where.push('a.url LIKE :bucket'); p.bucket = `https://${filtros.bucket.replace(/[\\%_]/g, '\\$&')}.s3.%`; }
  if (filtros.video) { where.push('w.id_animation = :video'); p.video = filtros.video; }
  if (filtros.situacao === 'sem_embedding') where.push('w.embedding IS NULL');
  if (filtros.situacao === 'video_varias') {
    where.push('w.id_animation IN (SELECT id_animation FROM words_sl_br GROUP BY id_animation HAVING COUNT(*) > 1)');
  }
  if (filtros.situacao === 'repetidas') {
    where.push('w.description IN (SELECT description FROM words_sl_br GROUP BY description HAVING COUNT(*) > 1)');
  }
  const filtro = where.join(' AND ');

  const { total } = await umaLinha(`
    SELECT COUNT(*) AS total FROM words_sl_br w JOIN animation_sl_br a ON a.id_animation = w.id_animation
     WHERE ${filtro}`, p);
  const pag = paginacao(req, total, POR_PAGINA);
  const palavras = await consultar(`
    SELECT w.id_word, w.description, w.id_animation, a.url, (w.embedding IS NULL) AS sem_embedding,
           (SELECT GROUP_CONCAT(w2.description ORDER BY w2.id_word SEPARATOR ' · ')
              FROM words_sl_br w2 WHERE w2.id_animation = w.id_animation AND w2.id_word <> w.id_word) AS outras
      FROM words_sl_br w JOIN animation_sl_br a ON a.id_animation = w.id_animation
     WHERE ${filtro}
     ORDER BY w.description, w.id_word
     LIMIT :limite OFFSET :offset`, { ...p, limite: POR_PAGINA, offset: pag.offset });

  const [resumo, hosts] = await Promise.all([
    umaLinha(`SELECT (SELECT COUNT(*) FROM words_sl_br) AS palavras, (SELECT COUNT(*) FROM animation_sl_br) AS videos,
                     (SELECT COUNT(*) FROM words_sl_br WHERE embedding IS NULL) AS sem_embedding`),
    consultar("SELECT DISTINCT SUBSTRING_INDEX(url, '/', 3) AS host FROM animation_sl_br"),
  ]);

  res.render('admin/palavras', {
    titulo: 'Palavras e sinais', secao: 'palavras',
    palavras: palavras.map((w) => ({ ...w, bucket: bucketDaUrl(w.url) })),
    filtros, pag, resumo, situacoes: SITUACOES,
    buckets: [...new Set(hosts.map((h) => bucketDaUrl(`${h.host}/`)).filter(Boolean))].sort(),
  });
};

function erroDaApi(req, res, destino, e) {
  if (e instanceof apiInterna.ErroApiInterna) {
    return voltar(req, res, destino, 'errors', `Nada foi alterado: não foi possível gerar a embedding. ${e.message}`);
  }
  throw e;
}

// POST /admin/palavras/:id — troca a descrição (e recalcula a embedding)
exports.salvar = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const destino = destinoAdmin(req.body.voltar, '/admin/palavras');
  const palavra = await umaLinha('SELECT id_word, id_animation, description FROM words_sl_br WHERE id_word = :id', { id });
  if (!palavra) return next();

  const descricao = descricaoSinal(req.body.descricao);
  if (!descricao) return voltar(req, res, destino, 'errors', 'A palavra não pode ficar vazia.');
  if (descricao === palavra.description) return voltar(req, res, destino, 'success', 'Nada mudou.');
  if (await sinais.descricaoRepetidaNoVideo(palavra.id_animation, descricao, id)) {
    return voltar(req, res, destino, 'errors', `Este vídeo já tem a palavra “${descricao}”.`);
  }

  let vetores;
  try {
    vetores = await sinais.embeddingsPorDescricao([descricao]);
  } catch (e) {
    return erroDaApi(req, res, destino, e);
  }
  await executar('UPDATE words_sl_br SET description = :descricao, embedding = :embedding WHERE id_word = :id',
    { id, descricao, embedding: vetores.get(descricao) });

  await registrar(req, 'palavra.editar', { id_word: id, de: palavra.description, para: descricao });
  apiInterna.pedirRecarga();
  return voltar(req, res, destino, 'success', `“${palavra.description}” agora é “${descricao}”.`);
};

// POST /admin/palavras/video/:id/adicionar — mais uma palavra para o mesmo vídeo (ex.: sinônimo)
exports.adicionar = async (req, res, next) => {
  const idAnimation = inteiro(req.params.id);
  const destino = destinoAdmin(req.body.voltar, '/admin/palavras');
  const video = await umaLinha('SELECT id_animation, url FROM animation_sl_br WHERE id_animation = :idAnimation', { idAnimation });
  if (!video) return next();

  const descricao = descricaoSinal(req.body.descricao);
  if (!descricao) return voltar(req, res, destino, 'errors', 'Digite a palavra.');
  if (await sinais.descricaoRepetidaNoVideo(idAnimation, descricao)) {
    return voltar(req, res, destino, 'errors', `Este vídeo já tem a palavra “${descricao}”.`);
  }

  let vetores;
  try {
    vetores = await sinais.embeddingsPorDescricao([descricao]);
  } catch (e) {
    return erroDaApi(req, res, destino, e);
  }
  await transacao(async (transaction) => {
    await executar('INSERT INTO words_sl_br (id_animation, description, embedding) VALUES (:idAnimation, :descricao, :embedding)',
      { idAnimation, descricao, embedding: vetores.get(descricao) }, { transaction });
    // Veio da lista "palavras sem sinal": ela sai da lista
    if (req.body.origem === 'termos') {
      await executar('DELETE FROM termos_sem_sinal WHERE termo = :descricao', { descricao }, { transaction });
    }
  });

  const outras = await consultar('SELECT description FROM words_sl_br WHERE id_animation = :idAnimation AND description <> :descricao',
    { idAnimation, descricao });
  await registrar(req, 'palavra.adicionar', { id_animation: idAnimation, palavra: descricao, video_de: outras.map((o) => o.description) });
  apiInterna.pedirRecarga();
  const destinoFinal = req.body.origem === 'termos' ? '/admin/qualidade' : destino;
  return voltar(req, res, destinoFinal, 'success',
    `“${descricao}” agora usa o vídeo de ${outras.length ? `“${outras[0].description}”` : 'este sinal'}. O tradutor atualiza em alguns segundos.`);
};

// POST /admin/palavras/:id/excluir — se era a única palavra do vídeo, o vídeo sai do banco também
exports.excluir = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const destino = destinoAdmin(req.body.voltar, '/admin/palavras');
  const palavra = await umaLinha(`
    SELECT w.id_word, w.description, w.id_animation, a.url,
           (SELECT COUNT(*) FROM words_sl_br w2 WHERE w2.id_animation = w.id_animation) AS palavras_no_video
      FROM words_sl_br w JOIN animation_sl_br a ON a.id_animation = w.id_animation
     WHERE w.id_word = :id`, { id });
  if (!palavra) return next();

  const ultima = Number(palavra.palavras_no_video) <= 1;
  await transacao(async (transaction) => {
    if (ultima) {
      await sinais.removerVideo(palavra.id_animation, req.admin.id, { transaction });
    } else {
      await executar('DELETE FROM words_sl_br WHERE id_word = :id', { id }, { transaction });
    }
  });

  await registrar(req, 'palavra.excluir', {
    id_word: id, palavra: palavra.description, video_removido: ultima ? palavra.url : null,
  });
  apiInterna.pedirRecarga();
  return voltar(req, res, destino, 'success', ultima
    ? `“${palavra.description}” e o vídeo dela saíram do banco. O arquivo continua no S3 e não volta na próxima varredura.`
    : `“${palavra.description}” saiu do banco. O vídeo continua com as outras palavras.`);
};

// POST /admin/palavras/embeddings — preenche as embeddings que faltam (até 2.000 por vez)
exports.gerarEmbeddings = async (req, res) => {
  const faltando = await consultar('SELECT id_word, description FROM words_sl_br WHERE embedding IS NULL LIMIT 2000');
  if (!faltando.length) return voltar(req, res, '/admin/palavras', 'success', 'Todas as palavras já têm embedding.');

  let vetores;
  try {
    vetores = await sinais.embeddingsPorDescricao(faltando.map((f) => f.description));
  } catch (e) {
    return erroDaApi(req, res, '/admin/palavras', e);
  }
  await transacao(async (transaction) => {
    for (let i = 0; i < faltando.length; i += 200) {
      const lote = faltando.slice(i, i + 200);
      const p = {};
      const casos = lote.map((f, j) => { p[`i${j}`] = f.id_word; p[`e${j}`] = vetores.get(f.description); return `WHEN :i${j} THEN CAST(:e${j} AS JSON)`; });
      await executar(`UPDATE words_sl_br SET embedding = CASE id_word ${casos.join(' ')} END WHERE id_word IN (:ids)`,
        { ...p, ids: lote.map((f) => f.id_word) }, { transaction });
    }
  });
  await registrar(req, 'palavra.embeddings', { total: faltando.length });
  return voltar(req, res, '/admin/palavras', 'success', `${faltando.length} embeddings geradas.`);
};

// POST /admin/palavras/recarregar — o tradutor relê os sinais do banco agora (em vez de esperar 1 hora)
exports.recarregar = async (req, res) => {
  const destino = destinoAdmin(req.body.voltar, '/admin/palavras');
  const ok = await apiInterna.pedirRecarga();
  if (ok) await registrar(req, 'tradutor.recarregar');
  return voltar(req, res, destino, ok ? 'success' : 'errors', ok
    ? 'O tradutor está relendo os sinais do banco. Leva alguns segundos.'
    : 'A API de tradução não respondeu. Ela relê os sinais sozinha a cada hora.');
};
