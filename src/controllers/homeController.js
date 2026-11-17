const { exclusoesDoUsuario } = require('../models/FeedbackModel');
const cursos = require('../data/cursos');

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
  res.render('ajuda', { emailContato: EMAIL_COMERCIAL }); // definido na seção de planos, abaixo
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

// Rota para a página de cursos (conteúdo em src/data/cursos.js)
exports.cursos = (req, res) => {
  res.render('cursos', cursos);
};

// ── Página de planos (informativa) ──────────────────────────
// Todos os textos e preços dos planos ficam aqui.
const LIMITE_PALAVRAS_FREE = 20;
const EMAIL_COMERCIAL = 'tradulibras.fam@gmail.com';

const CICLOS = [
  { id: 'mensal', rotulo: 'Mensal', meses: 1, desconto: 0, periodo: '/mês' },
  { id: 'semestral', rotulo: 'Semestral', meses: 6, desconto: 10, periodo: '/semestre' },
  { id: 'anual', rotulo: 'Anual', meses: 12, desconto: 20, periodo: '/ano' },
];

// Cada recurso é uma lista de trechos; { b: true } = negrito; token: true = mostra o "ⓘ O que é um token?"
const RECURSOS_BASE = [
  [{ t: 'Tradutor por texto e voz' }],
  [{ t: 'Glossário, cursos, histórico e tutorial' }],
];

const PLANOS = [
  {
    id: 'free',
    nome: 'Free',
    publico: 'Usuário individual',
    precos: { mensal: 0, semestral: 0, anual: 0 },
    recursos: [
      ...RECURSOS_BASE,
      { token: true, partes: [{ t: 'Até ' }, { t: `${LIMITE_PALAVRAS_FREE} tokens`, b: true }, { t: ' por tradução' }] },
    ],
    cta: { texto: 'Começar a traduzir', href: '/home' },
  },
  {
    id: 'enterprise',
    nome: 'Enterprise',
    publico: 'Organizações ou instituições de pequeno a médio porte',
    destaque: 'Mais popular',
    precos: { mensal: 249, semestral: 1345, anual: 2390 },
    recursos: [
      ...RECURSOS_BASE,
      { token: true, partes: [{ t: 'Sem limite', b: true }, { t: ' de tokens por tradução' }] },
    ],
    cta: { texto: 'Contratar Enterprise', assunto: 'Plano Enterprise', comCiclo: true },
  },
  {
    id: 'customized',
    nome: 'Customized',
    publico: 'Grandes organizações ou instituições com demandas específicas',
    precos: null, // sob consulta
    recursos: [
      [{ t: 'Tradutor por texto e voz, glossário, cursos, histórico e tutorial' }],
      { token: true, partes: [{ t: 'Sem limite', b: true }, { t: ' de tokens por tradução' }] },
      [{ t: 'Sinais personalizados', b: true }, { t: ' sob demanda' }],
      [{ t: 'Suporte dedicado', b: true }],
    ],
    cta: { texto: 'Falar com a equipe', assunto: 'Plano Customized' },
  },
];

const formatarReais = (valor) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(valor).replace(/ /g, ' ');

// Monta o que cada card mostra em cada ciclo (valor, período, preço cheio riscado e equivalente mensal)
function precosDoPlano(plano) {
  return CICLOS.map((ciclo) => {
    if (!plano.precos) {
      return { ciclo: ciclo.id, valor: 'Sob consulta', periodo: '', detalhe: 'Proposta sob medida para sua organização' };
    }
    const valor = plano.precos[ciclo.id];
    if (valor === 0) {
      return { ciclo: ciclo.id, valor: formatarReais(0), periodo: '', detalhe: 'Grátis para sempre' };
    }
    const cheio = plano.precos.mensal * ciclo.meses;
    return {
      ciclo: ciclo.id,
      valor: formatarReais(valor),
      periodo: ciclo.periodo,
      riscado: ciclo.desconto ? formatarReais(cheio) : null,
      detalhe: ciclo.desconto
        ? `equivale a ${formatarReais(Math.round(valor / ciclo.meses)).replace(' ', ' ')}/mês · ${ciclo.desconto}% OFF`
        : 'Cobrança mensal',
    };
  });
}

exports.planos = (req, res) => {
  res.render('planos', {
    ciclos: CICLOS,
    planos: PLANOS.map((p) => ({ ...p, exibicao: precosDoPlano(p) })),
    limitePalavrasFree: LIMITE_PALAVRAS_FREE,
    emailComercial: EMAIL_COMERCIAL,
  });
};
