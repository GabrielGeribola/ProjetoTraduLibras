const { consultar, umaLinha, executar } = require('../../config/consulta');
const { registrar } = require('../../services/auditoria');
const { youtubeId, fonteDoLink } = require('../../services/cursosService');
const {
  texto, textoLongo, inteiro, like, marcado, paginacao, voltar, destinoAdmin,
} = require('./util');

const TIPOS = { video: 'Vídeo', artigo: 'Artigo' };

const slugDe = (valor) => texto(valor, 80).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const listarTemas = () => consultar(`
  SELECT t.id_tema, t.slug, t.nome, t.ordem,
         (SELECT COUNT(*) FROM cursos_conteudos c WHERE c.id_tema = t.id_tema) AS total
    FROM cursos_temas t ORDER BY t.ordem, t.nome`);

// GET /admin/cursos — vídeos e artigos (com filtros) e os temas
exports.lista = async (req, res) => {
  const filtros = {
    q: texto(req.query.q, 100),
    tipo: TIPOS[req.query.tipo] ? req.query.tipo : '',
    tema: inteiro(req.query.tema) || '',
    status: ['publicado', 'rascunho', 'destaque'].includes(req.query.status) ? req.query.status : '',
  };
  const where = ['1 = 1'];
  const p = {};
  if (filtros.q) { where.push('(c.titulo LIKE :q OR c.descricao LIKE :q OR c.autor LIKE :q)'); p.q = like(filtros.q); }
  if (filtros.tipo) { where.push('c.tipo = :tipo'); p.tipo = filtros.tipo; }
  if (filtros.tema) { where.push('c.id_tema = :tema'); p.tema = filtros.tema; }
  if (filtros.status === 'publicado') where.push('c.ativo = 1');
  if (filtros.status === 'rascunho') where.push('c.ativo = 0');
  if (filtros.status === 'destaque') where.push('c.destaque = 1');

  const { total } = await umaLinha(`SELECT COUNT(*) AS total FROM cursos_conteudos c WHERE ${where.join(' AND ')}`, p);
  const pag = paginacao(req, total, 30);
  const conteudos = await consultar(`
    SELECT c.*, t.nome AS tema FROM cursos_conteudos c JOIN cursos_temas t ON t.id_tema = c.id_tema
     WHERE ${where.join(' AND ')}
     ORDER BY c.ordem, c.id_conteudo LIMIT :limite OFFSET :offset`, { ...p, limite: 30, offset: pag.offset });
  const contagem = await umaLinha(`
    SELECT SUM(tipo = 'video') AS videos, SUM(tipo = 'artigo') AS artigos, SUM(ativo = 0) AS rascunhos
      FROM cursos_conteudos`);

  res.render('admin/cursos', {
    titulo: 'Cursos e artigos', secao: 'cursos', conteudos, filtros, pag, tipos: TIPOS,
    temas: await listarTemas(), contagem, fonteDoLink,
  });
};

const VAZIO = {
  tipo: 'video', titulo: '', descricao: '', autor: '', link: '', id_tema: '', destaque: 0, ativo: 1, ordem: 1000,
};

exports.novo = async (req, res) => {
  res.render('admin/curso-form', {
    titulo: 'Novo conteúdo', secao: 'cursos', item: { ...VAZIO, tipo: TIPOS[req.query.tipo] ? req.query.tipo : 'video' },
    temas: await listarTemas(), tipos: TIPOS,
  });
};

exports.editar = async (req, res, next) => {
  const item = await umaLinha('SELECT * FROM cursos_conteudos WHERE id_conteudo = :id', { id: inteiro(req.params.id) });
  if (!item) return next();
  return res.render('admin/curso-form', {
    titulo: item.titulo, secao: 'cursos', item, temas: await listarTemas(), tipos: TIPOS,
    voltarPara: destinoAdmin(req.query.voltar, '/admin/cursos'),
  });
};

async function lerConteudo(body) {
  const item = {
    tipo: TIPOS[body.tipo] ? body.tipo : 'video',
    titulo: texto(body.titulo, 200),
    descricao: textoLongo(body.descricao, 600).replace(/\n+/g, ' '),
    autor: texto(body.autor, 120) || null,
    link: texto(body.link, 500),
    id_tema: inteiro(body.id_tema),
    destaque: marcado(body.destaque) ? 1 : 0,
    ativo: marcado(body.ativo) ? 1 : 0,
    ordem: inteiro(body.ordem, 1000),
    youtube_id: null,
  };
  const erros = [];
  if (!item.titulo) erros.push('Escreva o título.');
  if (!item.id_tema || !(await umaLinha('SELECT id_tema FROM cursos_temas WHERE id_tema = :id', { id: item.id_tema }))) {
    erros.push('Escolha um tema.');
  }
  if (item.tipo === 'video') {
    item.youtube_id = youtubeId(item.link);
    if (!item.youtube_id) erros.push('Cole o link do vídeo no YouTube (ex.: https://www.youtube.com/watch?v=...).');
    else item.link = `https://www.youtube.com/watch?v=${item.youtube_id}`;
  } else {
    item.autor = null;
    if (!/^https:\/\/[^\s/]+\.[^\s]+$/.test(item.link)) erros.push('O link do artigo precisa começar com https://.');
  }
  return { item, erros };
}

const voltarComErro = async (res, titulo, item, erros, extra = {}) => res.render('admin/curso-form', {
  titulo, secao: 'cursos', item, temas: await listarTemas(), tipos: TIPOS, errors: erros, ...extra,
});

// POST /admin/cursos
exports.criar = async (req, res) => {
  const { item, erros } = await lerConteudo(req.body);
  if (erros.length) return voltarComErro(res, 'Novo conteúdo', item, erros);
  const { id } = await executar(`
    INSERT INTO cursos_conteudos (tipo, titulo, descricao, autor, link, youtube_id, id_tema, destaque, ativo, ordem)
    VALUES (:tipo, :titulo, :descricao, :autor, :link, :youtube_id, :id_tema, :destaque, :ativo, :ordem)`, item);
  await registrar(req, 'curso.criar', { id, tipo: item.tipo, titulo: item.titulo });
  return voltar(req, res, '/admin/cursos', 'success', `“${item.titulo}” ${item.ativo ? 'publicado em /cursos' : 'salvo como rascunho'}.`);
};

// POST /admin/cursos/:id
exports.salvar = async (req, res, next) => {
  const id = inteiro(req.params.id);
  if (!(await umaLinha('SELECT id_conteudo FROM cursos_conteudos WHERE id_conteudo = :id', { id }))) return next();
  const destino = destinoAdmin(req.body.voltar, '/admin/cursos');
  const { item, erros } = await lerConteudo(req.body);
  if (erros.length) return voltarComErro(res, item.titulo || 'Conteúdo', { ...item, id_conteudo: id }, erros, { voltarPara: destino });
  await executar(`
    UPDATE cursos_conteudos SET tipo = :tipo, titulo = :titulo, descricao = :descricao, autor = :autor, link = :link,
           youtube_id = :youtube_id, id_tema = :id_tema, destaque = :destaque, ativo = :ativo, ordem = :ordem
     WHERE id_conteudo = :id`, { ...item, id });
  await registrar(req, 'curso.editar', { id, titulo: item.titulo, ativo: item.ativo });
  return voltar(req, res, destino, 'success', `“${item.titulo}” salvo.`);
};

// POST /admin/cursos/:id/excluir
exports.excluir = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const item = await umaLinha('SELECT id_conteudo, titulo FROM cursos_conteudos WHERE id_conteudo = :id', { id });
  if (!item) return next();
  await executar('DELETE FROM cursos_conteudos WHERE id_conteudo = :id', { id });
  await registrar(req, 'curso.excluir', { id, titulo: item.titulo });
  return voltar(req, res, destinoAdmin(req.body.voltar, '/admin/cursos'), 'success', `“${item.titulo}” excluído.`);
};

// ── Temas ──────────────────────────────────────────────────
exports.criarTema = async (req, res) => {
  const nome = texto(req.body.nome, 80);
  const slug = slugDe(nome);
  if (!nome || !slug) return voltar(req, res, '/admin/cursos#temas', 'errors', 'Dê um nome ao tema.');
  if (await umaLinha('SELECT 1 AS ok FROM cursos_temas WHERE slug = :slug OR nome = :nome', { slug, nome })) {
    return voltar(req, res, '/admin/cursos#temas', 'errors', `Já existe o tema “${nome}”.`);
  }
  const { ordem } = await umaLinha('SELECT COALESCE(MAX(ordem), 0) + 10 AS ordem FROM cursos_temas');
  await executar('INSERT INTO cursos_temas (slug, nome, ordem) VALUES (:slug, :nome, :ordem)', { slug, nome, ordem });
  await registrar(req, 'curso.tema_criar', { nome });
  return voltar(req, res, '/admin/cursos#temas', 'success', `Tema “${nome}” criado.`);
};

exports.salvarTema = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const tema = await umaLinha('SELECT id_tema, nome FROM cursos_temas WHERE id_tema = :id', { id });
  if (!tema) return next();
  const nome = texto(req.body.nome, 80);
  if (!nome) return voltar(req, res, '/admin/cursos#temas', 'errors', 'O nome do tema não pode ficar vazio.');
  if (await umaLinha('SELECT 1 AS ok FROM cursos_temas WHERE nome = :nome AND id_tema <> :id', { nome, id })) {
    return voltar(req, res, '/admin/cursos#temas', 'errors', `Já existe o tema “${nome}”.`);
  }
  // O slug (usado nos filtros da página) não muda, para não quebrar links já compartilhados
  await executar('UPDATE cursos_temas SET nome = :nome, ordem = :ordem WHERE id_tema = :id',
    { id, nome, ordem: inteiro(req.body.ordem, 0) });
  await registrar(req, 'curso.tema_editar', { id, de: tema.nome, para: nome });
  return voltar(req, res, '/admin/cursos#temas', 'success', `Tema “${nome}” salvo.`);
};

exports.excluirTema = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const tema = await umaLinha(`
    SELECT t.id_tema, t.nome, (SELECT COUNT(*) FROM cursos_conteudos c WHERE c.id_tema = t.id_tema) AS total
      FROM cursos_temas t WHERE t.id_tema = :id`, { id });
  if (!tema) return next();
  if (Number(tema.total) > 0) {
    return voltar(req, res, '/admin/cursos#temas', 'errors', `O tema “${tema.nome}” tem ${tema.total} conteúdo(s). Mude o tema deles antes de excluir.`);
  }
  await executar('DELETE FROM cursos_temas WHERE id_tema = :id', { id });
  await registrar(req, 'curso.tema_excluir', { nome: tema.nome });
  return voltar(req, res, '/admin/cursos#temas', 'success', `Tema “${tema.nome}” excluído.`);
};
