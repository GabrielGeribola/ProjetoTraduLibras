const { consultar, umaLinha } = require('../../config/consulta');
const { texto, like, paginacao } = require('./util');

// Nome amigável de cada ação registrada em admin_log
const ACOES = {
  'usuario.criar': 'Criou usuário',
  'usuario.editar': 'Editou usuário',
  'usuario.link_senha': 'Enviou link de senha',
  'usuario.excluir': 'Excluiu usuário',
  'palavra.editar': 'Editou palavra',
  'palavra.adicionar': 'Adicionou palavra a um vídeo',
  'palavra.excluir': 'Excluiu palavra',
  'palavra.embeddings': 'Gerou embeddings',
  'tradutor.recarregar': 'Recarregou o tradutor',
  's3.varrer': 'Varreu o S3',
  's3.aprovar': 'Aprovou vídeos do S3',
  's3.excluir': 'Excluiu vídeos da importação',
  's3.restaurar': 'Restaurou vídeos da importação',
  's3.remover_ausente': 'Removeu vídeo ausente no S3',
  'qualidade.remover_termo': 'Removeu termo sem sinal',
  'plano.criar': 'Criou plano',
  'plano.editar': 'Editou plano',
  'plano.excluir': 'Excluiu plano',
  'curso.criar': 'Criou conteúdo de curso',
  'curso.editar': 'Editou conteúdo de curso',
  'curso.excluir': 'Excluiu conteúdo de curso',
  'curso.tema_criar': 'Criou tema',
  'curso.tema_editar': 'Editou tema',
  'curso.tema_excluir': 'Excluiu tema',
  'admin.promover': 'Virou administrador (script)',
};

// GET /admin/registro
exports.index = async (req, res) => {
  const filtros = {
    acao: ACOES[req.query.acao] ? req.query.acao : '',
    email: texto(req.query.email, 255),
  };
  const where = ['1 = 1'];
  const p = {};
  if (filtros.acao) { where.push('acao = :acao'); p.acao = filtros.acao; }
  if (filtros.email) { where.push('email LIKE :email'); p.email = like(filtros.email); }

  const { total } = await umaLinha(`SELECT COUNT(*) AS total FROM admin_log WHERE ${where.join(' AND ')}`, p);
  const pag = paginacao(req, total, 50);
  const registros = await consultar(`
    SELECT id_log, email, acao, detalhe, criado_em FROM admin_log WHERE ${where.join(' AND ')}
     ORDER BY id_log DESC LIMIT :limite OFFSET :offset`, { ...p, limite: 50, offset: pag.offset });

  res.render('admin/registro', {
    titulo: 'Registro de ações', secao: 'registro', registros, filtros, pag, acoes: ACOES,
  });
};

exports.ACOES = ACOES;
