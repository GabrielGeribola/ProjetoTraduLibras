// Funções pequenas usadas pelos controllers da administração

/** Texto de uma linha: espaços repetidos viram um, corta no tamanho máximo */
const texto = (valor, max = 255) => (typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Texto de várias linhas (recursos de plano, descrições) */
const textoLongo = (valor, max = 2000) => (typeof valor === 'string'
  ? valor.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').trim().slice(0, max)
  : '');

const inteiro = (valor, padrao = null) => {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : padrao;
};

/** "1.345,50" / "1345.5" -> 1345.5; vazio -> null; inválido -> NaN */
function dinheiro(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  let s = String(valor).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : Number.NaN;
}

const marcado = (valor) => valor === '1' || valor === 'on' || valor === true || valor === 'true';

/** Campo que pode vir como um valor ou como lista (checkboxes) */
const lista = (valor) => {
  if (Array.isArray(valor)) return valor;
  return valor === undefined || valor === null || valor === '' ? [] : [valor];
};

const ids = (valor) => [...new Set(lista(valor).map((v) => inteiro(v)).filter((n) => n > 0))];

/** Descrição de sinal no padrão do banco: minúsculas, um espaço entre palavras */
const descricaoSinal = (valor) => texto(valor, 100).toLowerCase();

/** "%" e "_" digitados na busca não viram curinga do LIKE */
const like = (valor) => `%${String(valor).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** URL da página atual trocando alguns parâmetros da busca (paginação, filtros) */
function urlCom(req, mudancas = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...req.query, ...mudancas })) {
    if (v === undefined || v === null || v === '' || Array.isArray(v)) continue;
    if (k === 'pagina' && Number(v) === 1) continue;
    params.set(k, v);
  }
  const qs = params.toString();
  return `${req.baseUrl}${req.path === '/' ? '' : req.path}${qs ? `?${qs}` : ''}`;
}

function paginacao(req, total, porPagina = 25) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(1, inteiro(req.query.pagina, 1)), paginas);
  return {
    pagina, paginas, porPagina, total,
    offset: (pagina - 1) * porPagina,
    link: (p) => urlCom(req, { pagina: p }),
  };
}

/** Só aceita voltar para páginas da própria administração */
const destinoAdmin = (valor, padrao = '/admin') => (
  typeof valor === 'string' && /^\/admin(?:\/[\w\-/]*)?(?:\?[\w\-=&%.+~]*)?$/.test(valor) ? valor : padrao
);

/** Mensagem + redirecionamento (mensagens aparecem no topo da página seguinte) */
function voltar(req, res, destino, tipo, mensagem) {
  if (mensagem) req.flash(tipo, mensagem);
  req.session.save(() => res.redirect(destino));
}

/** Express 4 não trata erro de função async: encaminha para o tratador geral */
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Formatação usada nas telas
const fuso = { timeZone: 'America/Sao_Paulo' };
// Coluna DATE (sem horário): "2026-11-18" sem passar por fuso horário
const isoDia = (d) => {
  if (!d) return '';
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const formatar = {
  isoDia,
  dia: (d) => (isoDia(d) ? isoDia(d).split('-').reverse().join('/') : '—'),
  data: (d) => (d ? new Date(d).toLocaleDateString('pt-BR', fuso) : '—'),
  dataHora: (d) => (d ? new Date(d).toLocaleString('pt-BR', { ...fuso, dateStyle: 'short', timeStyle: 'short' }) : '—'),
  numero: (n) => Number(n || 0).toLocaleString('pt-BR'),
  reais: (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })),
  bytes: (n) => {
    if (n === null || n === undefined) return '—';
    const mb = Number(n) / (1024 * 1024);
    return mb >= 1 ? `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(Number(n) / 1024))} KB`;
  },
  porcentagem: (parte, total) => (total ? `${Math.round((parte / total) * 100)}%` : '—'),
};

module.exports = {
  texto, textoLongo, inteiro, dinheiro, marcado, lista, ids, descricaoSinal, like,
  urlCom, paginacao, destinoAdmin, voltar, rota, formatar,
};
