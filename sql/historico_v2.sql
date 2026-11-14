-- Histórico v2: glosa e sequência guardadas por registro do usuário
-- Motivo: a glosa vem do navegador; guardando no registro de cada usuário,
-- um valor adulterado só aparece no histórico de quem o enviou (e não no de outros
-- usuários que traduziram a mesma frase).
-- Execute uma única vez em bancos criados com a versão anterior de historico.sql.

ALTER TABLE historico
  ADD COLUMN glosa     VARCHAR(500) NULL AFTER id_traducao,
  ADD COLUMN sequencia JSON         NULL AFTER glosa;
