// Estrutura do banco usada pela área de administração.
// Roda sozinha quando o servidor sobe (index.js) e também por `node scripts/tornar-admin.js`.
// É segura para rodar várias vezes: só cria o que ainda não existe e nunca apaga dados.
const { consultar, umaLinha, executar, transacao } = require('./consulta');
const { PLANOS_INICIAIS } = require('../data/planos');
const { TEMAS, VIDEOS, ARTIGOS } = require('../data/cursos');

const TABELAS = [
  // Planos exibidos em /planos e atribuídos aos usuários
  ['planos', `
    CREATE TABLE IF NOT EXISTS planos (
      id_plano         INT           NOT NULL AUTO_INCREMENT,
      slug             VARCHAR(40)   NOT NULL,
      nome             VARCHAR(60)   NOT NULL,
      publico          VARCHAR(200)  NOT NULL DEFAULT '',
      selo             VARCHAR(40)            DEFAULT NULL,  -- ex.: "Mais popular"
      preco_mensal     DECIMAL(10,2)          DEFAULT NULL,  -- os três vazios = "Sob consulta"
      preco_semestral  DECIMAL(10,2)          DEFAULT NULL,  -- vazio = mensal x 6 com o desconto do ciclo
      preco_anual      DECIMAL(10,2)          DEFAULT NULL,
      limite_tokens    INT                    DEFAULT NULL,  -- vazio = sem limite
      recursos         TEXT          NOT NULL,               -- um por linha (**negrito**, [token], {limite})
      cta_texto        VARCHAR(60)   NOT NULL DEFAULT 'Falar com a equipe',
      cta_link         VARCHAR(255)           DEFAULT NULL,  -- vazio = abre o contato comercial
      cta_assunto      VARCHAR(100)           DEFAULT NULL,
      cta_com_ciclo    TINYINT(1)    NOT NULL DEFAULT 0,
      ordem            INT           NOT NULL DEFAULT 0,
      ativo            TINYINT(1)    NOT NULL DEFAULT 1,
      criado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_plano),
      UNIQUE KEY uk_planos_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],

  // Página /cursos
  ['cursos_temas', `
    CREATE TABLE IF NOT EXISTS cursos_temas (
      id_tema  INT          NOT NULL AUTO_INCREMENT,
      slug     VARCHAR(60)  NOT NULL,
      nome     VARCHAR(80)  NOT NULL,
      ordem    INT          NOT NULL DEFAULT 0,
      PRIMARY KEY (id_tema),
      UNIQUE KEY uk_cursos_temas_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],

  ['cursos_conteudos', `
    CREATE TABLE IF NOT EXISTS cursos_conteudos (
      id_conteudo    INT                      NOT NULL AUTO_INCREMENT,
      tipo           ENUM('video','artigo')   NOT NULL,
      titulo         VARCHAR(200)             NOT NULL,
      descricao      VARCHAR(600)             NOT NULL DEFAULT '',
      autor          VARCHAR(120)                      DEFAULT NULL,  -- canal (vídeos)
      link           VARCHAR(500)             NOT NULL,
      youtube_id     VARCHAR(20)                       DEFAULT NULL,
      id_tema        INT                      NOT NULL,
      destaque       TINYINT(1)               NOT NULL DEFAULT 0,     -- aparece em "Comece por aqui"
      ativo          TINYINT(1)               NOT NULL DEFAULT 1,     -- 0 = rascunho (não aparece no site)
      ordem          INT                      NOT NULL DEFAULT 0,
      criado_em      DATETIME                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em  DATETIME                 NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_conteudo),
      KEY idx_cursos_conteudos_tema (id_tema),
      CONSTRAINT fk_cursos_conteudos_tema FOREIGN KEY (id_tema) REFERENCES cursos_temas (id_tema) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],

  // Vídeos do S3 encontrados pela varredura e a decisão do administrador
  // (url com collation binária: no S3 "Abacaxi.mp4" e "ABACAXI.mp4" são arquivos diferentes)
  ['importacao_s3', `
    CREATE TABLE IF NOT EXISTS importacao_s3 (
      id_importacao       INT                                        NOT NULL AUTO_INCREMENT,
      bucket              VARCHAR(63)                                NOT NULL,
      chave               VARCHAR(500)                               NOT NULL,
      url                 VARCHAR(255) COLLATE utf8mb4_bin           NOT NULL,
      descricao_sugerida  VARCHAR(100)                               NOT NULL DEFAULT '',
      tamanho             BIGINT                                              DEFAULT NULL,
      modificado_em       DATETIME                                            DEFAULT NULL,
      status              ENUM('pendente','aprovado','rejeitado')    NOT NULL DEFAULT 'pendente',
      id_animation        INT                                                 DEFAULT NULL,
      decidido_por        INT                                                 DEFAULT NULL,
      decidido_em         DATETIME                                            DEFAULT NULL,
      encontrado_em       DATETIME                                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_importacao),
      UNIQUE KEY uk_importacao_s3_url (url),
      KEY idx_importacao_s3_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],

  // Resumo de cada varredura (inclui os vídeos do banco que não estão mais no S3)
  ['importacao_s3_varreduras', `
    CREATE TABLE IF NOT EXISTS importacao_s3_varreduras (
      id_varredura    INT           NOT NULL AUTO_INCREMENT,
      feita_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_usuario      INT                    DEFAULT NULL,
      buckets         VARCHAR(255)  NOT NULL DEFAULT '',
      total_s3        INT           NOT NULL DEFAULT 0,
      ja_cadastrados  INT           NOT NULL DEFAULT 0,
      novos           INT           NOT NULL DEFAULT 0,
      ignorados       INT           NOT NULL DEFAULT 0,
      ausentes        JSON                   DEFAULT NULL,  -- [{id_animation, url, palavras}]
      PRIMARY KEY (id_varredura)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],

  // Registro do que cada administrador fez
  ['admin_log', `
    CREATE TABLE IF NOT EXISTS admin_log (
      id_log      INT            NOT NULL AUTO_INCREMENT,
      id_usuario  INT                     DEFAULT NULL,
      email       VARCHAR(255)            DEFAULT NULL,
      acao        VARCHAR(60)    NOT NULL,
      detalhe     VARCHAR(2000)           DEFAULT NULL,
      criado_em   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_log),
      KEY idx_admin_log_data (criado_em),
      KEY idx_admin_log_acao (acao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],
];

// Colunas novas na tabela de usuários
const COLUNAS_USUARIOS = [
  ['papel', "ENUM('usuario','admin') NOT NULL DEFAULT 'usuario'"],
  ['ativo', 'TINYINT(1) NOT NULL DEFAULT 1'],
  ['id_plano', 'INT NULL DEFAULT NULL'],
  ['plano_valido_ate', 'DATE NULL DEFAULT NULL'],
  ['ultimo_login', 'DATETIME NULL DEFAULT NULL'],
];

// Outro processo pode ter criado a mesma coluna/índice/ligação ao mesmo tempo: não é erro
const JA_EXISTE = new Set(['ER_TABLE_EXISTS_ERROR', 'ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_FK_DUP_NAME', 'ER_DUP_KEY']);
async function executarDdl(sql) {
  try {
    await executar(sql);
    return true;
  } catch (e) {
    if (JA_EXISTE.has(e?.original?.code || e?.parent?.code)) return false;
    throw e;
  }
}

async function tabelaExiste(tabela) {
  return Boolean(await umaLinha(
    'SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :tabela',
    { tabela },
  ));
}

async function colunaExiste(tabela, coluna) {
  return Boolean(await umaLinha(
    `SELECT 1 AS ok FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = :tabela AND column_name = :coluna`,
    { tabela, coluna },
  ));
}

async function restricaoExiste(tabela, nome) {
  return Boolean(await umaLinha(
    `SELECT 1 AS ok FROM information_schema.table_constraints
      WHERE table_schema = DATABASE() AND table_name = :tabela AND constraint_name = :nome`,
    { tabela, nome },
  ));
}

async function indiceExiste(tabela, nome) {
  return Boolean(await umaLinha(
    `SELECT 1 AS ok FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = :tabela AND index_name = :nome LIMIT 1`,
    { tabela, nome },
  ));
}

async function semearPlanos() {
  for (const p of PLANOS_INICIAIS) {
    await executar(`
      INSERT IGNORE INTO planos (slug, nome, publico, selo, preco_mensal, preco_semestral, preco_anual, limite_tokens,
                                 recursos, cta_texto, cta_link, cta_assunto, cta_com_ciclo, ordem)
      VALUES (:slug, :nome, :publico, :selo, :preco_mensal, :preco_semestral, :preco_anual, :limite_tokens,
              :recursos, :cta_texto, :cta_link, :cta_assunto, :cta_com_ciclo, :ordem)`, p);
  }
}

async function semearCursos() {
  await transacao(async (transaction) => {
    const ids = {};
    for (const [i, t] of TEMAS.entries()) {
      await executar('INSERT IGNORE INTO cursos_temas (slug, nome, ordem) VALUES (:slug, :nome, :ordem)',
        { slug: t.id, nome: t.nome, ordem: (i + 1) * 10 }, { transaction });
    }
    for (const t of await consultar('SELECT id_tema, slug FROM cursos_temas', {}, { transaction })) ids[t.slug] = t.id_tema;

    const itens = [
      ...VIDEOS.map((v) => ({
        tipo: 'video', titulo: v.titulo, descricao: v.descricao || '', autor: v.autor || null,
        link: `https://www.youtube.com/watch?v=${v.id}`, youtube_id: v.id, tema: v.tema, destaque: v.destaque ? 1 : 0,
      })),
      ...ARTIGOS.map((a) => ({
        tipo: 'artigo', titulo: a.titulo, descricao: a.descricao || '', autor: null,
        link: a.link, youtube_id: null, tema: a.tema, destaque: a.destaque ? 1 : 0,
      })),
    ];
    for (const [i, item] of itens.entries()) {
      await executar(`
        INSERT INTO cursos_conteudos (tipo, titulo, descricao, autor, link, youtube_id, id_tema, destaque, ordem)
        VALUES (:tipo, :titulo, :descricao, :autor, :link, :youtube_id, :id_tema, :destaque, :ordem)`,
      { ...item, id_tema: ids[item.tema], ordem: (i + 1) * 10 }, { transaction });
    }
  });
}

/** Cria tabelas e colunas que faltam. Devolve a lista do que foi criado. */
async function prepararBanco() {
  const criado = [];

  for (const [nome, ddl] of TABELAS) {
    if (!(await tabelaExiste(nome)) && await executarDdl(ddl)) criado.push(`tabela ${nome}`);
  }

  for (const [coluna, definicao] of COLUNAS_USUARIOS) {
    if (!(await colunaExiste('Usuarios_testes', coluna))
        && await executarDdl(`ALTER TABLE Usuarios_testes ADD COLUMN \`${coluna}\` ${definicao}`)) {
      criado.push(`coluna Usuarios_testes.${coluna}`);
    }
  }
  // Busca de palavras na administração e checagem de "essa palavra já tem sinal" na importação do S3
  if (!(await indiceExiste('words_sl_br', 'idx_words_description'))
      && await executarDdl('ALTER TABLE words_sl_br ADD INDEX idx_words_description (description)')) {
    criado.push('índice words_sl_br.description');
  }

  if (!(await restricaoExiste('Usuarios_testes', 'fk_usuarios_plano'))
      && await executarDdl(`ALTER TABLE Usuarios_testes ADD CONSTRAINT fk_usuarios_plano
                            FOREIGN KEY (id_plano) REFERENCES planos (id_plano) ON DELETE SET NULL`)) {
    criado.push('ligação Usuarios_testes -> planos');
  }

  // Conteúdo inicial (planos e cursos que estavam no código), uma vez só.
  // Vários servidores podem subir juntos (ex.: nodemon + script): quem reserva a carga em
  // migracoes_aplicadas faz; os outros pulam. Se cair no meio, a reserva vence em 5 minutos e é refeita.
  await executar(`
    CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
      nome         VARCHAR(80) NOT NULL,
      iniciada_em  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      feita_em     DATETIME             DEFAULT NULL,
      PRIMARY KEY (nome)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
  const cargas = [
    ['planos_iniciais', 'SELECT COUNT(*) AS n FROM planos', semearPlanos],
    ['cursos_iniciais', 'SELECT (SELECT COUNT(*) FROM cursos_conteudos) + (SELECT COUNT(*) FROM cursos_temas) AS n', semearCursos],
  ];
  for (const [nome, contagem, semear] of cargas) {
    const marca = await umaLinha('SELECT feita_em FROM migracoes_aplicadas WHERE nome = :nome', { nome });
    if (marca?.feita_em) continue;
    const reservou = marca
      ? (await executar(`UPDATE migracoes_aplicadas SET iniciada_em = NOW()
                          WHERE nome = :nome AND feita_em IS NULL AND iniciada_em < NOW() - INTERVAL 5 MINUTE`, { nome })).linhas === 1
      : (await executar('INSERT IGNORE INTO migracoes_aplicadas (nome) VALUES (:nome)', { nome })).linhas === 1;
    if (!reservou) continue; // outro processo está fazendo agora

    // Só preenche tabela vazia (se alguém já cadastrou algo, não mistura)
    if (Number((await umaLinha(contagem)).n) === 0) {
      await semear();
      criado.push(`conteúdo ${nome}`);
    }
    await executar('UPDATE migracoes_aplicadas SET feita_em = NOW() WHERE nome = :nome', { nome });
  }

  return criado;
}

module.exports = { prepararBanco, tabelaExiste };
