const { exclusoesDoUsuario } = require('../models/FeedbackModel');
const { paginaCursos } = require('../services/cursosService');
const { paginaPlanos, EMAIL_COMERCIAL } = require('../services/planosService');

// Rota para a página home (tradutor).
// Usuário logado recebe os sinais que marcou como incorretos, para a tradução evitá-los.
exports.home = async (req, res) => {
  let exclusoes = [];
  if (req.session.user) {
    try {
      exclusoes = (await exclusoesDoUsuario(req.session.user.id))
        .map(({ termo, expressao }) => ({ termo, expressao }));
    } catch (e) {
      console.error('Erro ao carregar sinais ocultados:', e);
    }
  }
  res.render('home', { exclusoes });
};

// Rota para a página de ajuda
exports.ajuda = (req, res) => {
  res.render('ajuda', { emailContato: EMAIL_COMERCIAL });
};

// Rota para a página do glossário
exports.sugestao = (req, res) => {
  res.render('sugestoes');
};

// ── Página Sobre ────────────────────────────────────────────
// foto: null mostra as iniciais (sem imagem quebrada); link: null não mostra "Contato"
const EQUIPE = [
  { nome: 'João Moura', foto: 'https://assetstradulibras.s3.us-east-1.amazonaws.com/imgs/icon-joao.jpeg', link: 'https://www.linkedin.com/in/jo%C3%A3o-moura-209b24291/', rede: 'LinkedIn' },
  { nome: 'Alice Batista Grem da Silva', foto: 'https://avatars.githubusercontent.com/u/61872177?v=4', link: 'https://github.com/Alice-Grem', rede: 'GitHub' },
  { nome: 'Gabriel Rodrigues', foto: 'https://avatars.githubusercontent.com/u/166943026?v=4', link: 'https://github.com/bielgeri', rede: 'GitHub' },
  { nome: 'Catarina Dalsan', foto: 'https://avatars.githubusercontent.com/u/125068498?v=4', link: 'https://github.com/Catyz00', rede: 'GitHub' },
  { nome: 'Guilherme Barboza', foto: null, link: null },
  { nome: 'Gustavo Dutra', foto: 'https://avatars.githubusercontent.com/u/140861646?v=4', link: 'https://github.com/OLemonPie', rede: 'GitHub' },
  { nome: 'Paulo César', foto: 'https://avatars.githubusercontent.com/u/140853105?v=4', link: 'https://github.com/PauloCezarSB', rede: 'GitHub' },
  { nome: 'Amanda Beserra', foto: null, link: 'https://www.linkedin.com/in/amanda-beserra-bb7924256/', rede: 'LinkedIn' },
];

const iniciais = (nome) => nome.split(/\s+/).filter(Boolean).map((p) => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join('').toUpperCase();

exports.sobre = (req, res) => {
  res.render('sobre', { equipe: EQUIPE.map((p) => ({ ...p, iniciais: iniciais(p.nome) })) });
};

// Rota para a página de cursos (conteúdo editado em /admin/cursos)
exports.cursos = async (req, res) => {
  res.render('cursos', await paginaCursos());
};

// ── Página de planos (informativa) ──────────────────────────
// Planos, preços e recursos são editados em /admin/planos (tabela planos).
exports.planos = async (req, res) => {
  res.render('planos', await paginaPlanos());
};
