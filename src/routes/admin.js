// Área de administração: /admin/...
// Só abre para contas com papel 'admin' (ver src/middlewares/admin.js e scripts/tornar-admin.js).
const express = require('express');
const { adminRequired } = require('../middlewares/admin');
const { umaLinha } = require('../config/consulta');
const { rota, formatar } = require('../controllers/admin/util');
const painel = require('../controllers/admin/painelController');
const usuarios = require('../controllers/admin/usuariosController');
const palavras = require('../controllers/admin/palavrasController');
const s3 = require('../controllers/admin/s3Controller');
const qualidade = require('../controllers/admin/qualidadeController');
const planos = require('../controllers/admin/planosController');
const cursos = require('../controllers/admin/cursosController');
const banco = require('../controllers/admin/bancoController');
const registro = require('../controllers/admin/registroController');

const router = express.Router();

router.use(adminRequired);
router.use(rota(async (req, res, next) => {
  res.locals.fmt = formatar;
  res.locals.urlAtual = req.originalUrl;
  res.set('Cache-Control', 'no-store');   // dados de usuários não ficam no cache do navegador
  res.set('X-Robots-Tag', 'noindex');
  // Número no menu "Importar do S3"
  const pendentes = await umaLinha("SELECT COUNT(*) AS n FROM importacao_s3 WHERE status = 'pendente'").catch(() => null);
  res.locals.pendentesS3 = pendentes ? Number(pendentes.n) : 0;
  next();
}));

router.get('/', rota(painel.index));

router.get('/usuarios', rota(usuarios.lista));
router.get('/usuarios/novo', rota(usuarios.novo));
router.post('/usuarios', rota(usuarios.criar));
router.get('/usuarios/:id(\\d+)', rota(usuarios.detalhe));
router.post('/usuarios/:id(\\d+)', rota(usuarios.salvar));
router.post('/usuarios/:id(\\d+)/senha', rota(usuarios.enviarSenha));
router.post('/usuarios/:id(\\d+)/excluir', rota(usuarios.excluir));

router.get('/palavras', rota(palavras.lista));
router.post('/palavras/recarregar', rota(palavras.recarregar));
router.post('/palavras/embeddings', rota(palavras.gerarEmbeddings));
router.post('/palavras/:id(\\d+)', rota(palavras.salvar));
router.post('/palavras/:id(\\d+)/excluir', rota(palavras.excluir));
router.post('/palavras/video/:id(\\d+)/adicionar', rota(palavras.adicionar));

router.get('/s3', rota(s3.index));
router.post('/s3/varrer', rota(s3.varrer));
router.post('/s3/decidir', rota(s3.decidir));
router.post('/s3/ausentes/:id(\\d+)/remover', rota(s3.removerAusente));

router.get('/qualidade', rota(qualidade.index));
router.post('/qualidade/termos/remover', rota(qualidade.removerTermo));

router.get('/planos', rota(planos.lista));
router.get('/planos/novo', rota(planos.novo));
router.post('/planos', rota(planos.criar));
router.get('/planos/:id(\\d+)', rota(planos.editar));
router.post('/planos/:id(\\d+)', rota(planos.salvar));
router.post('/planos/:id(\\d+)/excluir', rota(planos.excluir));

router.get('/cursos', rota(cursos.lista));
router.get('/cursos/novo', rota(cursos.novo));
router.post('/cursos', rota(cursos.criar));
router.get('/cursos/:id(\\d+)', rota(cursos.editar));
router.post('/cursos/:id(\\d+)', rota(cursos.salvar));
router.post('/cursos/:id(\\d+)/excluir', rota(cursos.excluir));
router.post('/cursos/temas', rota(cursos.criarTema));
router.post('/cursos/temas/:id(\\d+)', rota(cursos.salvarTema));
router.post('/cursos/temas/:id(\\d+)/excluir', rota(cursos.excluirTema));

router.get('/banco', rota(banco.index));
router.get('/banco/:tabela', rota(banco.tabela));

router.get('/registro', rota(registro.index));

module.exports = router;
