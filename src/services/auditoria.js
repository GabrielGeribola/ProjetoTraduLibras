const { executar } = require('../config/consulta');

/**
 * Registra uma ação da administração na tabela admin_log (aparece em /admin/registro).
 * Nunca derruba a ação principal: se o registro falhar, só avisa no terminal.
 */
async function registrar(req, acao, detalhe = null) {
  const texto = detalhe === null || typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe);
  try {
    await executar(
      'INSERT INTO admin_log (id_usuario, email, acao, detalhe) VALUES (:id, :email, :acao, :detalhe)',
      {
        id: req.admin?.id ?? req.session?.user?.id ?? null,
        email: req.admin?.email ?? req.session?.user?.email ?? null,
        acao: String(acao).slice(0, 60),
        detalhe: texto ? texto.slice(0, 2000) : null,
      },
    );
  } catch (e) {
    console.error('Erro ao registrar ação da administração:', e.message);
  }
}

module.exports = { registrar };
