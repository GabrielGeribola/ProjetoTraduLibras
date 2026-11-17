const { UniqueConstraintError } = require('sequelize');
const Traducao = require('../models/TraducaoModel');

const LIMITE_TEXTO = 500;

function textoLimpo(valor) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/\s+/g, ' ').trim();
}

// Guarda só os campos usados pelo site, com tamanho limitado
function sequenciaLimpa(sequencia) {
  if (!Array.isArray(sequencia)) return null;

  return sequencia.slice(0, 100).map((item) => {
    const url = textoLimpo(item?.url);
    return {
      termo_original: textoLimpo(item?.termo_original).slice(0, 100),
      expressao_libras: textoLimpo(item?.expressao_libras).slice(0, 100),
      url: url.startsWith('https://') ? url.slice(0, 500) : '',
    };
  });
}

// Reaproveita a tradução se a frase já foi traduzida antes (por qualquer usuário)
async function buscarOuCriarTraducao(texto, glosa, sequencia) {
  const existente = await Traducao.findOne({ where: { texto_original: texto } });
  if (existente) return existente;

  try {
    return await Traducao.create({ texto_original: texto, glosa, sequencia });
  } catch (e) {
    // Outra requisição criou a mesma frase ao mesmo tempo
    if (e instanceof UniqueConstraintError) {
      return Traducao.findOne({ where: { texto_original: texto } });
    }
    throw e;
  }
}

module.exports = { LIMITE_TEXTO, textoLimpo, sequenciaLimpa, buscarOuCriarTraducao };
