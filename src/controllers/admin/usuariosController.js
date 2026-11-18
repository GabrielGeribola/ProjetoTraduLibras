const crypto = require('crypto');
const bcryptjs = require('bcryptjs');
const validator = require('validator');
const { consultar, umaLinha, executar, transacao } = require('../../config/consulta');
const { registrar } = require('../../services/auditoria');
const { enviarLink } = require('../senhaController');
const {
  texto, inteiro, like, paginacao, voltar, destinoAdmin,
} = require('./util');

const POR_PAGINA = 25;

const planosParaSelect = () => consultar('SELECT id_plano, nome, ativo FROM planos ORDER BY ordem, id_plano');

/** Encerra as sessões abertas de um usuário (conta desativada, excluída ou que perdeu o papel) */
const encerrarSessoes = (idUsuario, opcoes = {}) => executar(
  "DELETE FROM `session` WHERE JSON_VALID(`data`) AND JSON_EXTRACT(`data`, '$.user.id') = :id",
  { id: idUsuario }, opcoes,
);

// GET /admin/usuarios
exports.lista = async (req, res) => {
  const filtros = {
    q: texto(req.query.q, 100),
    papel: ['admin', 'usuario'].includes(req.query.papel) ? req.query.papel : '',
    status: ['ativo', 'inativo'].includes(req.query.status) ? req.query.status : '',
    plano: req.query.plano === 'nenhum' ? 'nenhum' : (inteiro(req.query.plano) || ''),
  };

  const where = ['1 = 1'];
  const p = {};
  if (filtros.q) { where.push('u.email LIKE :q'); p.q = like(filtros.q); }
  if (filtros.papel) { where.push('u.papel = :papel'); p.papel = filtros.papel; }
  if (filtros.status) { where.push('u.ativo = :ativo'); p.ativo = filtros.status === 'ativo' ? 1 : 0; }
  if (filtros.plano === 'nenhum') where.push('u.id_plano IS NULL');
  else if (filtros.plano) { where.push('u.id_plano = :plano'); p.plano = filtros.plano; }

  const { total } = await umaLinha(`SELECT COUNT(*) AS total FROM Usuarios_testes u WHERE ${where.join(' AND ')}`, p);
  const pag = paginacao(req, total, POR_PAGINA);
  const usuarios = await consultar(`
    SELECT u.id, u.email, u.papel, u.ativo, u.createdAt, u.ultimo_login, u.plano_valido_ate,
           pl.nome AS plano,
           (SELECT COUNT(*) FROM historico h WHERE h.id_usuario = u.id) AS traducoes
      FROM Usuarios_testes u
      LEFT JOIN planos pl ON pl.id_plano = u.id_plano
     WHERE ${where.join(' AND ')}
     ORDER BY u.id DESC
     LIMIT :limite OFFSET :offset`, { ...p, limite: POR_PAGINA, offset: pag.offset });

  res.render('admin/usuarios', {
    titulo: 'Usuários', secao: 'usuarios', usuarios, filtros, pag, planos: await planosParaSelect(),
  });
};

// GET /admin/usuarios/novo
exports.novo = async (req, res) => {
  res.render('admin/usuario-novo', { titulo: 'Novo usuário', secao: 'usuarios', planos: await planosParaSelect() });
};

// POST /admin/usuarios — cria a conta com senha aleatória e manda o link para a pessoa criar a dela
exports.criar = async (req, res) => {
  const email = texto(req.body.email, 255).toLowerCase();
  const papel = req.body.papel === 'admin' ? 'admin' : 'usuario';
  const idPlano = inteiro(req.body.id_plano) || null;

  if (!validator.isEmail(email)) return voltar(req, res, '/admin/usuarios/novo', 'errors', 'Digite um e-mail válido.');
  if (await umaLinha('SELECT id FROM Usuarios_testes WHERE email = :email', { email })) {
    return voltar(req, res, '/admin/usuarios/novo', 'errors', 'Já existe uma conta com esse e-mail.');
  }

  const senhaAleatoria = crypto.randomBytes(24).toString('base64url');
  const { id } = await executar(`
    INSERT INTO Usuarios_testes (email, password, papel, ativo, id_plano, createdAt, updatedAt)
    VALUES (:email, :senha, :papel, 1, :idPlano, NOW(), NOW())`,
  { email, senha: bcryptjs.hashSync(senhaAleatoria, bcryptjs.genSaltSync()), papel, idPlano });

  let aviso = 'Conta criada. Enviamos um e-mail para a pessoa criar a senha (o link vale 1 hora).';
  try {
    await enviarLink({ id, email });
  } catch (e) {
    console.error('Erro ao enviar o e-mail da conta nova:', e);
    aviso = 'Conta criada, mas o e-mail não foi enviado. Use "Enviar link para criar senha" na página do usuário.';
  }
  await registrar(req, 'usuario.criar', { id, email, papel });
  return voltar(req, res, `/admin/usuarios/${id}`, 'success', aviso);
};

// GET /admin/usuarios/:id
exports.detalhe = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const usuario = await umaLinha(`
    SELECT u.id, u.email, u.papel, u.ativo, u.id_plano, u.plano_valido_ate, u.createdAt, u.updatedAt, u.ultimo_login,
           pl.nome AS plano,
           (SELECT COUNT(*) FROM historico h WHERE h.id_usuario = u.id) AS traducoes,
           (SELECT COUNT(*) FROM feedback_traducao f WHERE f.id_usuario = u.id) AS feedbacks,
           (SELECT COUNT(*) FROM feedback_traducao f WHERE f.id_usuario = u.id AND f.foi_util = 0) AS feedbacks_negativos,
           (SELECT COUNT(*) FROM exclusoes_usuario e WHERE e.id_usuario = u.id) AS sinais_ocultados,
           (SELECT COUNT(*) FROM \`session\` s WHERE JSON_VALID(s.data) AND JSON_EXTRACT(s.data, '$.user.id') = u.id
                                              AND s.expires > NOW()) AS sessoes
      FROM Usuarios_testes u
      LEFT JOIN planos pl ON pl.id_plano = u.id_plano
     WHERE u.id = :id`, { id });
  if (!usuario) return next();

  const historico = await consultar(`
    SELECT t.texto_original, COALESCE(h.glosa, t.glosa) AS glosa, h.data_traducao
      FROM historico h JOIN traducoes t ON t.id_traducao = h.id_traducao
     WHERE h.id_usuario = :id ORDER BY h.data_traducao DESC LIMIT 15`, { id });

  return res.render('admin/usuario', {
    titulo: usuario.email, secao: 'usuarios', usuario, historico,
    planos: await planosParaSelect(),
    ehVoce: usuario.id === req.admin.id,
    voltarPara: destinoAdmin(req.query.voltar, '/admin/usuarios'),
  });
};

// POST /admin/usuarios/:id — papel, status e plano
exports.salvar = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const atual = await umaLinha('SELECT id, email, papel, ativo, id_plano, plano_valido_ate FROM Usuarios_testes WHERE id = :id', { id });
  if (!atual) return next();
  const destino = `/admin/usuarios/${id}`;

  const papel = req.body.papel === 'admin' ? 'admin' : 'usuario';
  const ativo = req.body.ativo === '1' ? 1 : 0;
  const idPlano = inteiro(req.body.id_plano) || null;
  const validade = texto(req.body.plano_valido_ate, 10);
  if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return voltar(req, res, destino, 'errors', 'Data de validade inválida.');
  if (idPlano && !(await umaLinha('SELECT id_plano FROM planos WHERE id_plano = :idPlano', { idPlano }))) {
    return voltar(req, res, destino, 'errors', 'Plano não encontrado.');
  }

  // Ninguém tira o próprio acesso (evita a administração ficar sem nenhum administrador)
  if (id === req.admin.id && (papel !== 'admin' || !ativo)) {
    return voltar(req, res, destino, 'errors', 'Você não pode tirar o seu próprio acesso de administrador. Peça para outro administrador.');
  }

  await transacao(async (transaction) => {
    await executar(`
      UPDATE Usuarios_testes
         SET papel = :papel, ativo = :ativo, id_plano = :idPlano, plano_valido_ate = :validade, updatedAt = NOW()
       WHERE id = :id`, { id, papel, ativo, idPlano, validade: validade || null }, { transaction });
    // Conta desativada ou que perdeu o papel de admin sai na hora
    if (!ativo || (atual.papel === 'admin' && papel !== 'admin')) await encerrarSessoes(id, { transaction });
  });

  await registrar(req, 'usuario.editar', {
    id, email: atual.email,
    de: { papel: atual.papel, ativo: atual.ativo, id_plano: atual.id_plano },
    para: { papel, ativo, id_plano: idPlano, plano_valido_ate: validade || null },
  });
  return voltar(req, res, destino, 'success', 'Usuário atualizado.');
};

// POST /admin/usuarios/:id/senha — manda o link de "criar nova senha" (o mesmo do "Esqueci a senha")
exports.enviarSenha = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const usuario = await umaLinha('SELECT id, email FROM Usuarios_testes WHERE id = :id', { id });
  if (!usuario) return next();
  try {
    await enviarLink(usuario);
  } catch (e) {
    console.error('Erro ao enviar link de senha pela administração:', e);
    return voltar(req, res, `/admin/usuarios/${id}`, 'errors', 'Não foi possível enviar o e-mail agora. Confira a configuração de e-mail (SMTP).');
  }
  await registrar(req, 'usuario.link_senha', { id, email: usuario.email });
  return voltar(req, res, `/admin/usuarios/${id}`, 'success', `Link para criar nova senha enviado para ${usuario.email}.`);
};

// POST /admin/usuarios/:id/excluir — apaga a conta (histórico, feedback e sinais ocultados vão junto)
exports.excluir = async (req, res, next) => {
  const id = inteiro(req.params.id);
  const usuario = await umaLinha('SELECT id, email FROM Usuarios_testes WHERE id = :id', { id });
  if (!usuario) return next();
  if (id === req.admin.id) return voltar(req, res, `/admin/usuarios/${id}`, 'errors', 'Você não pode excluir a sua própria conta por aqui.');

  await transacao(async (transaction) => {
    await encerrarSessoes(id, { transaction });
    await executar('DELETE FROM Usuarios_testes WHERE id = :id', { id }, { transaction });
  });
  await registrar(req, 'usuario.excluir', { id, email: usuario.email });
  return voltar(req, res, '/admin/usuarios', 'success', `Conta ${usuario.email} excluída.`);
};
