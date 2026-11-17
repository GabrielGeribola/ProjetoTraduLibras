-- Feedback por usuário + recuperação de senha
-- Banco: app_tradu_embedding (MySQL 8). Depende de sql/historico.sql (tabela traducoes).
-- Pode ser executado mais de uma vez: só cria as tabelas se ainda não existirem.
--
-- Antes: o feedback ia para feedback_log sem dono, e 3 votos negativos de QUALQUER pessoa
-- criavam uma exclusão global (tabela exclusoes) — uma pessoa sozinha alterava o resultado de todos.
-- Agora: cada voto pertence a um usuário e só muda as traduções desse usuário.
-- As tabelas antigas feedback_log e exclusoes ficam como estão (legado, não são mais usadas pelo site).

-- Um voto por usuário em cada frase (votar de novo atualiza o voto anterior)
CREATE TABLE IF NOT EXISTS feedback_traducao (
  id_feedback    INT          NOT NULL AUTO_INCREMENT,
  id_usuario     INT          NOT NULL,
  id_traducao    INT          NOT NULL,
  foi_util       TINYINT(1)   NOT NULL,
  glosa          VARCHAR(500)          DEFAULT NULL,  -- glosa que o usuário viu ao votar
  criado_em      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_feedback),
  UNIQUE KEY uk_feedback_usuario_traducao (id_usuario, id_traducao),
  KEY idx_feedback_traducao (id_traducao),
  CONSTRAINT fk_feedback_usuario  FOREIGN KEY (id_usuario)  REFERENCES Usuarios_testes (id)     ON DELETE CASCADE,
  CONSTRAINT fk_feedback_traducao FOREIGN KEY (id_traducao) REFERENCES traducoes (id_traducao) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sinais que o usuário marcou como incorretos para um termo.
-- Nas próximas traduções DESSE usuário, a API escolhe outro sinal para o termo.
CREATE TABLE IF NOT EXISTS exclusoes_usuario (
  id_usuario          INT          NOT NULL,
  termo               VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,  -- termo da glosa (minúsculo)
  expressao_excluida  VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,  -- sinal rejeitado (minúsculo)
  id_feedback         INT                   DEFAULT NULL,         -- voto que originou a exclusão
  criado_em           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario, termo, expressao_excluida),
  KEY idx_exclusoes_feedback (id_feedback),
  CONSTRAINT fk_exclusoes_usuario  FOREIGN KEY (id_usuario)  REFERENCES Usuarios_testes (id)                ON DELETE CASCADE,
  CONSTRAINT fk_exclusoes_feedback FOREIGN KEY (id_feedback) REFERENCES feedback_traducao (id_feedback) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Links de "Esqueci a senha": guarda só o hash do token, válido por 1 hora e de uso único
CREATE TABLE IF NOT EXISTS redefinicao_senha (
  id           INT       NOT NULL AUTO_INCREMENT,
  id_usuario   INT       NOT NULL,
  token_hash   CHAR(64)  NOT NULL,  -- SHA-256 do token enviado por e-mail
  expira_em    DATETIME  NOT NULL,
  usado_em     DATETIME           DEFAULT NULL,
  criado_em    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_redefinicao_token (token_hash),
  KEY idx_redefinicao_usuario (id_usuario),
  CONSTRAINT fk_redefinicao_usuario FOREIGN KEY (id_usuario) REFERENCES Usuarios_testes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
