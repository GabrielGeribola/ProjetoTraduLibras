-- Palavras que o tradutor não encontrou no banco de sinais (gravadas pela API Python).
-- Banco: app_tradu_embedding (MySQL 8).
--
-- Serve de lista de prioridades para gravar sinais novos:
--   SELECT termo, ocorrencias, ultima_vez FROM termos_sem_sinal ORDER BY ocorrencias DESC LIMIT 50;
--
-- Para desligar a gravação, defina REGISTRAR_SEM_SINAL=0 no ambiente da API.

CREATE TABLE IF NOT EXISTS termos_sem_sinal (
  termo        VARCHAR(100) NOT NULL,
  ocorrencias  INT UNSIGNED NOT NULL DEFAULT 1,
  primeira_vez DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_vez   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (termo),
  KEY idx_termos_sem_sinal_ocorrencias (ocorrencias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
