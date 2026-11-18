const { consultar, umaLinha } = require('../../config/consulta');
const apiInterna = require('../../services/apiInterna');
const { ACOES } = require('./registroController');

// GET /admin — visão geral
exports.index = async (req, res) => {
  const [usuarios, sinais, traducoes, feedback, s3, termos, ultimaVarredura, acoes, api] = await Promise.all([
    umaLinha(`
      SELECT COUNT(*) AS total,
             SUM(papel = 'admin') AS admins,
             SUM(ativo = 0) AS inativos,
             SUM(createdAt >= NOW() - INTERVAL 7 DAY) AS novos7,
             SUM(ultimo_login >= NOW() - INTERVAL 7 DAY) AS ativos7
        FROM Usuarios_testes`),
    umaLinha(`
      SELECT (SELECT COUNT(*) FROM words_sl_br) AS palavras,
             (SELECT COUNT(*) FROM animation_sl_br) AS videos,
             (SELECT COUNT(*) FROM words_sl_br WHERE embedding IS NULL) AS sem_embedding`),
    umaLinha(`
      SELECT (SELECT COUNT(*) FROM traducoes) AS frases,
             (SELECT COUNT(*) FROM historico) AS historico,
             (SELECT COUNT(*) FROM historico WHERE data_traducao >= NOW() - INTERVAL 7 DAY) AS historico7`),
    umaLinha(`
      SELECT COUNT(*) AS total, SUM(foi_util = 1) AS uteis,
             (SELECT COUNT(*) FROM exclusoes_usuario) AS sinais_ocultados
        FROM feedback_traducao`),
    umaLinha("SELECT SUM(status = 'pendente') AS pendentes, SUM(status = 'rejeitado') AS rejeitados FROM importacao_s3"),
    consultar('SELECT termo, ocorrencias FROM termos_sem_sinal ORDER BY ocorrencias DESC, ultima_vez DESC LIMIT 8'),
    umaLinha(`SELECT feita_em, novos, total_s3, JSON_LENGTH(ausentes) AS ausentes
                FROM importacao_s3_varreduras ORDER BY id_varredura DESC LIMIT 1`),
    consultar('SELECT email, acao, detalhe, criado_em FROM admin_log ORDER BY id_log DESC LIMIT 8'),
    apiInterna.status().then((s) => ({ online: true, ...s })).catch((e) => ({ online: false, erro: e.message })),
  ]);

  res.render('admin/painel', {
    titulo: 'Painel', secao: 'painel',
    usuarios, sinais, traducoes, feedback, s3, termos, ultimaVarredura, acoes, api, nomesAcoes: ACOES,
  });
};
