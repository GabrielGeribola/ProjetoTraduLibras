-- Histórico de traduções por usuário
-- Banco: app_tradu_embedding (MySQL 8)
-- Pode ser executado mais de uma vez: só cria as tabelas se ainda não existirem.

-- Cada frase traduzida é salva uma única vez e reaproveitada entre usuários
CREATE TABLE IF NOT EXISTS traducoes (
  id_traducao     INT          NOT NULL AUTO_INCREMENT,
  texto_original  VARCHAR(500) NOT NULL,
  glosa           VARCHAR(500)          DEFAULT NULL,
  sequencia       JSON                  DEFAULT NULL,  -- [{termo_original, expressao_libras, url}]
  createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_traducao),
  UNIQUE KEY uk_traducoes_texto (texto_original)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Liga o usuário às traduções que ele fez
CREATE TABLE IF NOT EXISTS historico (
  id_historico    INT      NOT NULL AUTO_INCREMENT,
  id_usuario      INT      NOT NULL,
  id_traducao     INT      NOT NULL,
  data_traducao   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_historico),
  KEY idx_historico_usuario_data (id_usuario, data_traducao),
  KEY idx_historico_traducao (id_traducao),
  CONSTRAINT fk_historico_usuario  FOREIGN KEY (id_usuario)  REFERENCES Usuarios_testes (id)        ON DELETE CASCADE,
  CONSTRAINT fk_historico_traducao FOREIGN KEY (id_traducao) REFERENCES traducoes (id_traducao)    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
