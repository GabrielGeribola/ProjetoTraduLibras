const { umaLinha } = require('../config/consulta');

// Números mostrados na tela inicial ("4.600+ palavras com sinal", "70 vídeos e artigos").
// Vêm do banco e ficam guardados por 10 minutos; se o banco falhar, a página aparece sem os números.

const VALIDADE_MS = 10 * 60 * 1000;
let guardado = null;
let validoAte = 0;

// 4.687 vira 4.600 (exibido como "4.600+"): nunca promete mais do que existe
const arredondarParaBaixo = (n) => (n >= 1000 ? Math.floor(n / 100) * 100 : n);

async function numerosDoSite() {
  if (guardado && Date.now() < validoAte) return guardado;
  try {
    const [palavras, conteudos] = await Promise.all([
      umaLinha('SELECT COUNT(DISTINCT LOWER(description)) AS total FROM words_sl_br'),
      umaLinha('SELECT COUNT(*) AS total FROM cursos_conteudos WHERE ativo = 1'),
    ]);
    guardado = {
      palavras: arredondarParaBaixo(Number(palavras?.total) || 0),
      conteudos: Number(conteudos?.total) || 0,
    };
    validoAte = Date.now() + VALIDADE_MS;
  } catch (e) {
    console.error('Não foi possível contar palavras e conteúdos para a tela inicial:', e.message);
    validoAte = Date.now() + 60 * 1000; // tenta de novo em 1 minuto
  }
  return guardado;
}

module.exports = { numerosDoSite };
