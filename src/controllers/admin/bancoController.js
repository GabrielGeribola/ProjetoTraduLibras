// Visão do banco (só leitura): tabelas, tamanho, colunas, ligações e os registros de cada tabela.
// Senhas, tokens e dados de sessão nunca aparecem.
const { consultar, umaLinha } = require('../../config/consulta');
const { texto, paginacao } = require('./util');

const GRUPOS = [
  ['Sinais', {
    words_sl_br: 'Palavras e expressões; cada uma aponta para um vídeo',
    animation_sl_br: 'Vídeos dos sinais (URL no S3)',
  }],
  ['Usuários', {
    Usuarios_testes: 'Contas do site (papel, plano, status)',
    session: 'Sessões abertas (quem está logado)',
    redefinicao_senha: 'Links de "esqueci a senha"',
  }],
  ['Traduções e qualidade', {
    traducoes: 'Frases já traduzidas (uma vez cada)',
    historico: 'Histórico de cada usuário',
    feedback_traducao: 'Votos 👍/👎 dos usuários',
    exclusoes_usuario: 'Sinais que cada usuário marcou como errados',
    termos_sem_sinal: 'Palavras pedidas que ainda não têm sinal',
    validation_metrics: 'Testes de tradução usados pelo avaliador',
  }],
  ['Conteúdo do site', {
    planos: 'Planos da página /planos',
    cursos_temas: 'Temas da página /cursos',
    cursos_conteudos: 'Vídeos e artigos da página /cursos',
  }],
  ['Administração', {
    importacao_s3: 'Vídeos do S3 encontrados e a decisão (aprovado/excluído)',
    importacao_s3_varreduras: 'Resumo de cada varredura do S3',
    admin_log: 'Registro das ações da administração',
    migracoes_aplicadas: 'Controle das cargas iniciais (planos e cursos), feitas uma vez',
  }],
];
const DESCRICOES = Object.assign({}, ...GRUPOS.map(([, t]) => t));
const LEGADO = { exclusoes: 'Legado: exclusões globais antigas (não usada)', feedback_log: 'Legado: feedback antigo sem dono (não usada)' };

// Colunas que nunca são mostradas
const OCULTAS = new Set(['password', 'token_hash']);
const ehOculta = (tabela, coluna) => OCULTAS.has(coluna) || (tabela === 'session' && coluna === 'data');

async function tabelas() {
  return consultar(`
    SELECT table_name AS nome, ROUND((data_length + index_length) / 1024 / 1024, 2) AS mb, table_comment AS comentario
      FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
     ORDER BY table_name`);
}

const ident = (nome) => `\`${String(nome).replace(/`/g, '')}\``;

// GET /admin/banco
exports.index = async (req, res) => {
  const lista = await tabelas();
  // Contagem exata (a estimativa do information_schema erra muito no InnoDB)
  for (const t of lista) {
    t.linhas = Number((await umaLinha(`SELECT COUNT(*) AS n FROM ${ident(t.nome)}`)).n);
  }
  const porNome = Object.fromEntries(lista.map((t) => [t.nome, t]));
  const usadas = new Set();
  const grupos = GRUPOS.map(([titulo, desc]) => ({
    titulo,
    tabelas: Object.keys(desc).filter((n) => porNome[n]).map((n) => { usadas.add(n); return { ...porNome[n], descricao: desc[n] }; }),
  }));
  const outras = lista.filter((t) => !usadas.has(t.nome)).map((t) => ({
    ...t,
    descricao: LEGADO[t.nome] || (/_backup_\d{8}$/.test(t.nome) ? `Cópia de segurança de ${t.nome.replace(/_backup_\d{8}$/, '')}` : ''),
  }));
  if (outras.length) grupos.push({ titulo: 'Legado e cópias de segurança', tabelas: outras });

  const [ligacoes, info] = await Promise.all([
    consultar(`
      SELECT table_name AS tabela, column_name AS coluna, referenced_table_name AS ref_tabela, referenced_column_name AS ref_coluna
        FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
       ORDER BY table_name, column_name`),
    umaLinha('SELECT DATABASE() AS banco, VERSION() AS versao, NOW() AS agora'),
  ]);

  res.render('admin/banco', {
    titulo: 'Banco de dados', secao: 'banco', grupos, ligacoes, info,
    totalMb: lista.reduce((s, t) => s + Number(t.mb || 0), 0),
  });
};

// GET /admin/banco/:tabela
exports.tabela = async (req, res, next) => {
  const nome = texto(req.params.tabela, 64);
  const existe = (await tabelas()).find((t) => t.nome === nome);
  if (!existe) return next();

  const colunas = await consultar(`
    SELECT column_name AS nome, column_type AS tipo, is_nullable AS nulo, column_key AS chave,
           column_default AS padrao, extra
      FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = :nome
     ORDER BY ordinal_position`, { nome });
  const ligacoes = await consultar(`
    SELECT column_name AS coluna, referenced_table_name AS ref_tabela, referenced_column_name AS ref_coluna
      FROM information_schema.key_column_usage
     WHERE table_schema = DATABASE() AND table_name = :nome AND referenced_table_name IS NOT NULL`, { nome });

  // Filtro simples: coluna contém o texto
  const visiveis = colunas.filter((c) => !ehOculta(nome, c.nome));
  const filtroColuna = visiveis.find((c) => c.nome === req.query.coluna)?.nome || '';
  const filtroValor = texto(req.query.valor, 100);
  const where = filtroColuna && filtroValor ? `WHERE CAST(${ident(filtroColuna)} AS CHAR) LIKE :valor` : '';
  const p = where ? { valor: `%${filtroValor.replace(/[\\%_]/g, (c) => `\\${c}`)}%` } : {};

  const { total } = await umaLinha(`SELECT COUNT(*) AS total FROM ${ident(nome)} ${where}`, p);
  const pag = paginacao(req, total, 25);
  const pk = colunas.filter((c) => c.chave === 'PRI').map((c) => ident(c.nome));
  const selecao = colunas.map((c) => {
    if (ehOculta(nome, c.nome)) return `NULL AS ${ident(c.nome)}`;
    if (c.nome === 'embedding') return `JSON_LENGTH(${ident(c.nome)}) AS ${ident(c.nome)}`;
    return `LEFT(CAST(${ident(c.nome)} AS CHAR), 300) AS ${ident(c.nome)}`;
  });
  const linhas = await consultar(`
    SELECT ${selecao.join(', ')} FROM ${ident(nome)} ${where}
    ${pk.length ? `ORDER BY ${pk.map((c) => `${c} DESC`).join(', ')}` : ''}
    LIMIT :limite OFFSET :offset`, { ...p, limite: 25, offset: pag.offset });

  return res.render('admin/banco-tabela', {
    titulo: nome, secao: 'banco', nome, descricao: DESCRICOES[nome] || LEGADO[nome] || '',
    colunas: colunas.map((c) => ({ ...c, oculta: ehOculta(nome, c.nome) })),
    ligacoes, linhas, pag, filtroColuna, filtroValor, visiveis, mb: existe.mb,
  });
};
