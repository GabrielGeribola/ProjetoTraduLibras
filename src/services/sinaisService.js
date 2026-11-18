// Gravações nas tabelas de sinais (words_sl_br = palavras, animation_sl_br = vídeos).
// Toda palavra gravada já sai com a coluna `embedding` preenchida (gerada pela API Python);
// se a API estiver fora do ar, nada é gravado.
const { consultar, umaLinha, executar } = require('../config/consulta');
const apiInterna = require('./apiInterna');

/** Gera os vetores de uma lista de descrições (repetidas são calculadas uma vez só) */
async function embeddingsPorDescricao(descricoes) {
  const unicas = [...new Set(descricoes)];
  const vetores = await apiInterna.gerarEmbeddings(unicas);
  return new Map(unicas.map((d, i) => [d, JSON.stringify(vetores[i])]));
}

/** Já existe essa descrição para esse vídeo? (sem diferenciar acento e maiúscula: "voce" = "você") */
async function descricaoRepetidaNoVideo(idAnimation, descricao, ignorarIdWord = 0, opcoes = {}) {
  return Boolean(await umaLinha(`
    SELECT 1 AS ok FROM words_sl_br
     WHERE id_animation = :idAnimation AND description = :descricao AND id_word <> :ignorar LIMIT 1`,
  { idAnimation, descricao, ignorar: ignorarIdWord }, opcoes));
}

/**
 * Marca a URL como "não cadastrar" na importação do S3. Usado quando um vídeo é removido do banco,
 * para a próxima varredura não trazê-lo de volta como novo.
 */
async function marcarUrlRejeitada(url, idUsuario, opcoes = {}) {
  const m = String(url).match(/^https:\/\/([^.]+)\.s3\.[^/]+\/(.+)$/);
  if (!m || url.length > 255) return;
  await executar(`
    INSERT INTO importacao_s3 (bucket, chave, url, descricao_sugerida, status, decidido_por, decidido_em)
    VALUES (:bucket, :chave, :url, '', 'rejeitado', :idUsuario, NOW())
    ON DUPLICATE KEY UPDATE status = 'rejeitado', id_animation = NULL, decidido_por = :idUsuario, decidido_em = NOW()`,
  { bucket: m[1], chave: m[2].slice(0, 500), url, idUsuario }, opcoes);
}

/** Remove o vídeo e todas as palavras dele (o arquivo continua no S3) */
async function removerVideo(idAnimation, idUsuario, opcoes = {}) {
  const video = await umaLinha('SELECT id_animation, url FROM animation_sl_br WHERE id_animation = :idAnimation',
    { idAnimation }, opcoes);
  if (!video) return null;
  const palavras = await consultar('SELECT description FROM words_sl_br WHERE id_animation = :idAnimation',
    { idAnimation }, opcoes);
  await executar('DELETE FROM words_sl_br WHERE id_animation = :idAnimation', { idAnimation }, opcoes);
  await executar('DELETE FROM animation_sl_br WHERE id_animation = :idAnimation', { idAnimation }, opcoes);
  await marcarUrlRejeitada(video.url, idUsuario, opcoes);
  return { ...video, palavras: palavras.map((p) => p.description) };
}

/**
 * Cadastra vídeos novos: cada item { url, descricao } vira uma linha em animation_sl_br e uma em
 * words_sl_br (com embedding). Os vetores devem vir de embeddingsPorDescricao (antes da transação).
 * Devolve Map url -> id_animation.
 */
async function cadastrarVideos(itens, vetores, opcoes = {}) {
  const resultado = new Map();
  for (let i = 0; i < itens.length; i += 200) {
    const lote = itens.slice(i, i + 200);
    const p = {};
    const valores = lote.map((item, j) => { p[`u${j}`] = item.url; return `(:u${j})`; });
    await executar(`INSERT INTO animation_sl_br (url) VALUES ${valores.join(', ')}`, p, opcoes);

    // Descobre o id de cada vídeo pela URL (comparação exata: no S3 maiúscula e minúscula são arquivos diferentes)
    const criados = await consultar(`
      SELECT id_animation, url FROM animation_sl_br
       WHERE url COLLATE utf8mb4_bin IN (:urls) ORDER BY id_animation DESC`,
    { urls: lote.map((item) => item.url) }, opcoes);
    for (const c of criados) if (!resultado.has(c.url)) resultado.set(c.url, c.id_animation);

    const pw = {};
    const linhas = lote.map((item, j) => {
      pw[`a${j}`] = resultado.get(item.url);
      pw[`d${j}`] = item.descricao;
      pw[`e${j}`] = vetores.get(item.descricao);
      return `(:a${j}, :d${j}, :e${j})`;
    });
    await executar(`INSERT INTO words_sl_br (id_animation, description, embedding) VALUES ${linhas.join(', ')}`, pw, opcoes);
  }
  return resultado;
}

module.exports = {
  embeddingsPorDescricao, descricaoRepetidaNoVideo, marcarUrlRejeitada, removerVideo, cadastrarVideos,
};
