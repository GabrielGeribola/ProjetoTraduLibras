const { consultar, umaLinha, executar } = require('../../config/consulta');
const { registrar } = require('../../services/auditoria');
const { texto, like, paginacao, voltar } = require('./util');

// GET /admin/qualidade — o que falta no banco e o que os usuários marcaram como errado
exports.index = async (req, res) => {
  const q = texto(req.query.q, 100);
  const p = q ? { q: like(q) } : {};
  const where = q ? 'WHERE termo LIKE :q' : '';

  const { total } = await umaLinha(`SELECT COUNT(*) AS total FROM termos_sem_sinal ${where}`, p);
  const pag = paginacao(req, total, 50);
  const [termos, marcados, feedback, negativos] = await Promise.all([
    consultar(`SELECT termo, ocorrencias, primeira_vez, ultima_vez FROM termos_sem_sinal ${where}
                ORDER BY ocorrencias DESC, ultima_vez DESC LIMIT :limite OFFSET :offset`, { ...p, limite: 50, offset: pag.offset }),
    consultar(`
      SELECT termo, expressao_excluida AS expressao, COUNT(*) AS usuarios, MAX(criado_em) AS ultima_vez
        FROM exclusoes_usuario GROUP BY termo, expressao_excluida
       ORDER BY usuarios DESC, ultima_vez DESC LIMIT 50`),
    umaLinha('SELECT COUNT(*) AS total, SUM(foi_util = 1) AS uteis, SUM(foi_util = 0) AS negativos FROM feedback_traducao'),
    consultar(`
      SELECT t.texto_original, COALESCE(f.glosa, t.glosa) AS glosa, f.atualizado_em, u.email, u.id AS id_usuario
        FROM feedback_traducao f
        JOIN traducoes t ON t.id_traducao = f.id_traducao
        LEFT JOIN Usuarios_testes u ON u.id = f.id_usuario
       WHERE f.foi_util = 0
       ORDER BY f.atualizado_em DESC LIMIT 30`),
  ]);

  res.render('admin/qualidade', {
    titulo: 'Qualidade da tradução', secao: 'qualidade',
    q, pag, termos, marcados, feedback, negativos,
  });
};

// POST /admin/qualidade/termos/remover — tira da lista "palavras sem sinal" (ex.: erro de digitação)
exports.removerTermo = async (req, res) => {
  const termo = texto(req.body.termo, 100);
  if (!termo) return voltar(req, res, '/admin/qualidade', 'errors', 'Termo inválido.');
  const { linhas } = await executar('DELETE FROM termos_sem_sinal WHERE termo = :termo', { termo });
  if (linhas) await registrar(req, 'qualidade.remover_termo', { termo });
  return voltar(req, res, '/admin/qualidade', 'success', linhas ? `“${termo}” saiu da lista.` : 'Esse termo já não estava na lista.');
};
