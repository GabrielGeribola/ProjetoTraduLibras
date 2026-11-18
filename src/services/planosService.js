const { consultar } = require('../config/consulta');
const { CICLOS, EMAIL_COMERCIAL, PLANOS_INICIAIS } = require('../data/planos');

const LIMITE_FREE_PADRAO = 20;

const formatarReais = (valor) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
}).format(valor).replace(/ /g, ' ');

const temValor = (v) => v !== null && v !== undefined && v !== '';
const sobConsulta = (p) => !temValor(p.preco_mensal) && !temValor(p.preco_semestral) && !temValor(p.preco_anual);

// Preço do ciclo: o valor cadastrado ou, se vazio, o mensal x meses com o desconto do ciclo
function precoDoCiclo(plano, ciclo) {
  const valor = plano[`preco_${ciclo.id}`];
  if (temValor(valor)) return Number(valor);
  if (!temValor(plano.preco_mensal)) return null;
  return Math.round(Number(plano.preco_mensal) * ciclo.meses * (1 - ciclo.desconto / 100));
}

// O que cada card mostra em cada ciclo (valor, período, preço cheio riscado e equivalente mensal)
function precosDoPlano(plano) {
  return CICLOS.map((ciclo) => {
    const valor = precoDoCiclo(plano, ciclo);
    if (sobConsulta(plano) || valor === null) {
      return { ciclo: ciclo.id, valor: 'Sob consulta', periodo: '', detalhe: 'Proposta sob medida para sua organização' };
    }
    if (valor === 0) {
      return { ciclo: ciclo.id, valor: formatarReais(0), periodo: '', detalhe: 'Grátis para sempre' };
    }
    const cheio = temValor(plano.preco_mensal) ? Number(plano.preco_mensal) * ciclo.meses : null;
    const comDesconto = ciclo.meses > 1 && cheio && valor < cheio;
    const desconto = comDesconto ? Math.round((1 - valor / cheio) * 100) : 0;
    return {
      ciclo: ciclo.id,
      valor: formatarReais(valor),
      periodo: ciclo.periodo,
      riscado: comDesconto ? formatarReais(cheio) : null,
      detalhe: ciclo.meses === 1
        ? 'Cobrança mensal'
        : `equivale a ${formatarReais(Math.round(valor / ciclo.meses))}/mês${desconto ? ` · ${desconto}% OFF` : ''}`,
    };
  });
}

// "Até **{limite} tokens** por tradução [token]" -> { token: true, partes: [{t:'Até '}, {t:'20 tokens', b:true}, ...] }
function recursosDoPlano(plano) {
  return String(plano.recursos || '')
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => {
      const token = /\s*\[token\]$/i.test(linha);
      const texto = linha
        .replace(/\s*\[token\]$/i, '')
        .replace(/\{limite\}/g, temValor(plano.limite_tokens) ? String(plano.limite_tokens) : 'ilimitados');
      const partes = texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (
        /^\*\*[^*]+\*\*$/.test(p) ? { t: p.slice(2, -2), b: true } : { t: p }
      ));
      return { token, partes };
    });
}

/** Planos do banco (ou a lista inicial, se o banco não responder) */
async function listarPlanos({ incluirInativos = false } = {}) {
  try {
    return await consultar(`
      SELECT p.*, (SELECT COUNT(*) FROM Usuarios_testes u WHERE u.id_plano = p.id_plano) AS usuarios
        FROM planos p
       ${incluirInativos ? '' : 'WHERE p.ativo = 1'}
       ORDER BY p.ordem, p.id_plano`);
  } catch (e) {
    if (incluirInativos) throw e; // a administração precisa saber que o banco falhou
    console.error('Erro ao carregar planos do banco; usando a lista inicial:', e.message);
    return PLANOS_INICIAIS.map((p) => ({ ...p, ativo: 1 }));
  }
}

/** Dados da página pública /planos */
async function paginaPlanos() {
  const planos = await listarPlanos();
  const free = planos.find((p) => p.slug === 'free');
  const limites = planos.map((p) => p.limite_tokens).filter(temValor).map(Number);
  return {
    ciclos: CICLOS,
    planos: planos.map((p) => ({
      id: p.slug,
      nome: p.nome,
      publico: p.publico,
      destaque: p.selo || null,
      precos: sobConsulta(p) ? null : true,
      exibicao: precosDoPlano(p),
      recursos: recursosDoPlano(p),
      cta: {
        texto: p.cta_texto,
        href: p.cta_link || null,
        assunto: p.cta_assunto || `Plano ${p.nome}`,
        comCiclo: Boolean(Number(p.cta_com_ciclo)),
      },
    })),
    limitePalavrasFree: free && temValor(free.limite_tokens)
      ? Number(free.limite_tokens)
      : (limites.length ? Math.min(...limites) : LIMITE_FREE_PADRAO),
    emailComercial: EMAIL_COMERCIAL,
  };
}

module.exports = { CICLOS, EMAIL_COMERCIAL, listarPlanos, paginaPlanos, precosDoPlano, recursosDoPlano, formatarReais };
