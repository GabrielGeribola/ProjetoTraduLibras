// Planos iniciais. Desde a área de administração, os planos ficam na tabela `planos` e são editados
// em /admin/planos. Esta lista só é usada para criar a tabela pela primeira vez (src/config/migracoes.js)
// e como reserva se o banco não responder.
//
// recursos: um por linha. **texto** = negrito; [token] no fim mostra o "ⓘ O que é um token?";
// {limite} é trocado pelo limite de tokens do plano.

const CICLOS = [
  { id: 'mensal', rotulo: 'Mensal', meses: 1, desconto: 0, periodo: '/mês' },
  { id: 'semestral', rotulo: 'Semestral', meses: 6, desconto: 10, periodo: '/semestre' },
  { id: 'anual', rotulo: 'Anual', meses: 12, desconto: 20, periodo: '/ano' },
];

const EMAIL_COMERCIAL = 'tradulibras.fam@gmail.com';

const PLANOS_INICIAIS = [
  {
    slug: 'free',
    nome: 'Free',
    publico: 'Usuário individual',
    selo: null,
    preco_mensal: 0, preco_semestral: 0, preco_anual: 0,
    limite_tokens: 20,
    recursos: [
      'Tradutor por texto e voz',
      'Glossário, cursos, histórico e tutorial',
      'Até **{limite} tokens** por tradução [token]',
    ].join('\n'),
    cta_texto: 'Começar a traduzir', cta_link: '/home', cta_assunto: null, cta_com_ciclo: 0,
    ordem: 10,
  },
  {
    slug: 'enterprise',
    nome: 'Enterprise',
    publico: 'Organizações ou instituições de pequeno a médio porte',
    selo: 'Mais popular',
    preco_mensal: 249, preco_semestral: 1345, preco_anual: 2390,
    limite_tokens: null,
    recursos: [
      'Tradutor por texto e voz',
      'Glossário, cursos, histórico e tutorial',
      '**Sem limite** de tokens por tradução [token]',
    ].join('\n'),
    cta_texto: 'Contratar Enterprise', cta_link: null, cta_assunto: 'Plano Enterprise', cta_com_ciclo: 1,
    ordem: 20,
  },
  {
    slug: 'customized',
    nome: 'Customized',
    publico: 'Grandes organizações ou instituições com demandas específicas',
    selo: null,
    preco_mensal: null, preco_semestral: null, preco_anual: null, // sob consulta
    limite_tokens: null,
    recursos: [
      'Tradutor por texto e voz, glossário, cursos, histórico e tutorial',
      '**Sem limite** de tokens por tradução [token]',
      '**Sinais personalizados** sob demanda',
      '**Suporte dedicado**',
    ].join('\n'),
    cta_texto: 'Falar com a equipe', cta_link: null, cta_assunto: 'Plano Customized', cta_com_ciclo: 0,
    ordem: 30,
  },
];

module.exports = { CICLOS, EMAIL_COMERCIAL, PLANOS_INICIAIS };
