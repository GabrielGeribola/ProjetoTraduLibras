const { umaLinha, executar } = require('../../config/consulta');
const { registrar } = require('../../services/auditoria');
const {
  CICLOS, listarPlanos, precosDoPlano, recursosDoPlano,
} = require('../../services/planosService');
const {
  texto, textoLongo, inteiro, dinheiro, marcado, voltar,
} = require('./util');

const slugDe = (valor) => texto(valor, 80).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const VAZIO = {
  slug: '', nome: '', publico: '', selo: '', preco_mensal: null, preco_semestral: null, preco_anual: null,
  limite_tokens: null, recursos: '', cta_texto: 'Falar com a equipe', cta_link: '', cta_assunto: '',
  cta_com_ciclo: 0, ordem: 100, ativo: 1,
};

// GET /admin/planos
exports.lista = async (req, res) => {
  const planos = await listarPlanos({ incluirInativos: true });
  res.render('admin/planos', {
    titulo: 'Planos', secao: 'planos', ciclos: CICLOS,
    planos: planos.map((p) => ({ ...p, exibicao: precosDoPlano(p), itens: recursosDoPlano(p) })),
  });
};

exports.novo = (req, res) => {
  res.render('admin/plano-form', { titulo: 'Novo plano', secao: 'planos', plano: VAZIO, ciclos: CICLOS });
};

exports.editar = async (req, res, next) => {
  const plano = await umaLinha(`
    SELECT p.*, (SELECT COUNT(*) FROM Usuarios_testes u WHERE u.id_plano = p.id_plano) AS usuarios
      FROM planos p WHERE p.id_plano = :id`, { id: inteiro(req.params.id) });
  if (!plano) return next();
  return res.render('admin/plano-form', { titulo: `Plano ${plano.nome}`, secao: 'planos', plano, ciclos: CICLOS });
};

function lerPlano(body) {
  const plano = {
    nome: texto(body.nome, 60),
    slug: slugDe(body.slug || body.nome),
    publico: texto(body.publico, 200),
    selo: texto(body.selo, 40) || null,
    preco_mensal: dinheiro(body.preco_mensal),
    preco_semestral: dinheiro(body.preco_semestral),
    preco_anual: dinheiro(body.preco_anual),
    limite_tokens: String(body.limite_tokens || '').trim() === '' ? null : inteiro(body.limite_tokens, Number.NaN),
    recursos: textoLongo(body.recursos, 2000),
    cta_texto: texto(body.cta_texto, 60),
    cta_link: texto(body.cta_link, 255) || null,
    cta_assunto: texto(body.cta_assunto, 100) || null,
    cta_com_ciclo: marcado(body.cta_com_ciclo) ? 1 : 0,
    ordem: inteiro(body.ordem, 100),
    ativo: marcado(body.ativo) ? 1 : 0,
  };
  const erros = [];
  if (!plano.nome) erros.push('Dê um nome ao plano.');
  if (!plano.slug) erros.push('O identificador precisa ter letras ou números.');
  if (['preco_mensal', 'preco_semestral', 'preco_anual'].some((c) => Number.isNaN(plano[c]))) erros.push('Preço inválido: use números, ex.: 249 ou 1.345,00.');
  if (Number.isNaN(plano.limite_tokens) || (plano.limite_tokens !== null && plano.limite_tokens < 1)) erros.push('O limite de tokens precisa ser um número inteiro maior que zero (ou vazio para sem limite).');
  if (!plano.recursos) erros.push('Escreva pelo menos um recurso.');
  if (!plano.cta_texto) erros.push('Escreva o texto do botão.');
  if (plano.cta_link && !/^(\/[\w\-/]*|https:\/\/\S+)$/.test(plano.cta_link)) erros.push('O link do botão deve começar com / (página do site) ou https://.');
  return { plano, erros };
}

async function slugEmUso(slug, ignorarId = 0) {
  return Boolean(await umaLinha('SELECT 1 AS ok FROM planos WHERE slug = :slug AND id_plano <> :id', { slug, id: ignorarId }));
}

// POST /admin/planos
exports.criar = async (req, res) => {
  const { plano, erros } = lerPlano(req.body);
  if (!erros.length && await slugEmUso(plano.slug)) erros.push(`Já existe um plano com o identificador “${plano.slug}”.`);
  if (erros.length) {
    return res.render('admin/plano-form', {
      titulo: 'Novo plano', secao: 'planos', plano: { ...VAZIO, ...plano }, ciclos: CICLOS, errors: erros,
    });
  }
  const { id } = await executar(`
    INSERT INTO planos (slug, nome, publico, selo, preco_mensal, preco_semestral, preco_anual, limite_tokens, recursos,
                        cta_texto, cta_link, cta_assunto, cta_com_ciclo, ordem, ativo)
    VALUES (:slug, :nome, :publico, :selo, :preco_mensal, :preco_semestral, :preco_anual, :limite_tokens, :recursos,
            :cta_texto, :cta_link, :cta_assunto, :cta_com_ciclo, :ordem, :ativo)`, plano);
  await registrar(req, 'plano.criar', { id, nome: plano.nome });
  return voltar(req, res, '/admin/planos', 'success', `Plano “${plano.nome}” criado.`);
};

// POST /admin/planos/:id
exports.salvar = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const atual = await umaLinha('SELECT id_plano, nome FROM planos WHERE id_plano = :id', { id });
  if (!atual) return next();
  const { plano, erros } = lerPlano(req.body);
  if (!erros.length && await slugEmUso(plano.slug, id)) erros.push(`Já existe um plano com o identificador “${plano.slug}”.`);
  if (erros.length) {
    return res.render('admin/plano-form', {
      titulo: `Plano ${atual.nome}`, secao: 'planos', plano: { ...plano, id_plano: id }, ciclos: CICLOS, errors: erros,
    });
  }
  await executar(`
    UPDATE planos SET slug = :slug, nome = :nome, publico = :publico, selo = :selo, preco_mensal = :preco_mensal,
           preco_semestral = :preco_semestral, preco_anual = :preco_anual, limite_tokens = :limite_tokens,
           recursos = :recursos, cta_texto = :cta_texto, cta_link = :cta_link, cta_assunto = :cta_assunto,
           cta_com_ciclo = :cta_com_ciclo, ordem = :ordem, ativo = :ativo
     WHERE id_plano = :id`, { ...plano, id });
  await registrar(req, 'plano.editar', { id, nome: plano.nome, ativo: plano.ativo });
  return voltar(req, res, '/admin/planos', 'success', `Plano “${plano.nome}” salvo. A página /planos já mostra a mudança.`);
};

// POST /admin/planos/:id/excluir — só sem usuários no plano (senão, desative)
exports.excluir = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const plano = await umaLinha(`
    SELECT p.id_plano, p.nome, (SELECT COUNT(*) FROM Usuarios_testes u WHERE u.id_plano = p.id_plano) AS usuarios
      FROM planos p WHERE p.id_plano = :id`, { id });
  if (!plano) return next();
  if (Number(plano.usuarios) > 0) {
    return voltar(req, res, `/admin/planos/${id}`, 'errors',
      `${plano.usuarios} usuário(s) estão neste plano. Troque o plano deles ou desmarque "Aparece no site" para escondê-lo.`);
  }
  await executar('DELETE FROM planos WHERE id_plano = :id', { id });
  await registrar(req, 'plano.excluir', { id, nome: plano.nome });
  return voltar(req, res, '/admin/planos', 'success', `Plano “${plano.nome}” excluído.`);
};
