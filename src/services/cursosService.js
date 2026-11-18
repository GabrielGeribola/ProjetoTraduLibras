const { consultar } = require('../config/consulta');
const { TEMAS, VIDEOS, ARTIGOS } = require('../data/cursos');

function fonteDoLink(link) {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

/** Aceita o link do YouTube em qualquer formato (watch, youtu.be, shorts, embed) ou só o código */
function youtubeId(valor) {
  const texto = String(valor || '').trim();
  if (/^[\w-]{11}$/.test(texto)) return texto;
  const m = texto.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

const ehPdf = (link) => /\.pdf($|\?)/i.test(link) || /\/download\//.test(link);

// Mesmo formato que a página /cursos sempre usou
function montarPagina(temasBase, videosBase, artigosBase) {
  const nomeDoTema = Object.fromEntries(temasBase.map((t) => [t.id, t.nome]));

  const videos = videosBase.map((v) => ({
    ...v,
    tipo: 'video',
    temaNome: nomeDoTema[v.tema] || '',
    link: `https://www.youtube.com/watch?v=${v.id}`,
    thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
  }));

  const artigos = artigosBase.map((a) => ({
    ...a,
    tipo: 'artigo',
    temaNome: nomeDoTema[a.tema] || '',
    fonte: fonteDoLink(a.link),
    pdf: ehPdf(a.link),
  }));

  // Só mostra filtros de temas que têm conteúdo
  const temas = temasBase
    .map((t) => ({ ...t, total: videos.filter((v) => v.tema === t.id).length + artigos.filter((a) => a.tema === t.id).length }))
    .filter((t) => t.total > 0);

  return { temas, videos, artigos };
}

/** Dados da página pública /cursos (do banco; se ele não responder, da lista inicial) */
async function paginaCursos() {
  try {
    const temas = await consultar('SELECT slug, nome FROM cursos_temas ORDER BY ordem, nome');
    const itens = await consultar(`
      SELECT c.tipo, c.titulo, c.descricao, c.autor, c.link, c.youtube_id, c.destaque, t.slug AS tema
        FROM cursos_conteudos c
        JOIN cursos_temas t ON t.id_tema = c.id_tema
       WHERE c.ativo = 1
       ORDER BY c.ordem, c.id_conteudo`);
    return montarPagina(
      temas.map((t) => ({ id: t.slug, nome: t.nome })),
      itens.filter((i) => i.tipo === 'video' && i.youtube_id).map((i) => ({
        id: i.youtube_id, titulo: i.titulo, autor: i.autor || '', tema: i.tema,
        destaque: Boolean(i.destaque), descricao: i.descricao,
      })),
      itens.filter((i) => i.tipo === 'artigo').map((i) => ({
        titulo: i.titulo, tema: i.tema, destaque: Boolean(i.destaque), descricao: i.descricao, link: i.link,
      })),
    );
  } catch (e) {
    console.error('Erro ao carregar cursos do banco; usando a lista inicial:', e.message);
    return montarPagina(TEMAS, VIDEOS, ARTIGOS);
  }
}

module.exports = { paginaCursos, youtubeId, fonteDoLink, ehPdf };
