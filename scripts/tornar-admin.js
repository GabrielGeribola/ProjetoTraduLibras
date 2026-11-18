#!/usr/bin/env node
// Dá (ou tira) o papel de administrador de uma conta já cadastrada no site.
// Uso (na raiz do projeto, com o .env configurado):
//   node scripts/tornar-admin.js pessoa@exemplo.com              -> vira administrador
//   node scripts/tornar-admin.js pessoa@exemplo.com --remover    -> volta a ser usuário comum
// Depois, a pessoa entra normalmente em /login e cai direto em /admin.
// Com o primeiro administrador criado, os próximos podem ser promovidos pela tela Administração > Usuários.
require('dotenv').config();
const { prepararBanco } = require('../src/config/migracoes');
const { sequelize, umaLinha, executar } = require('../src/config/consulta');

async function main() {
  const [email, opcao] = process.argv.slice(2);
  if (!email || email.startsWith('-')) {
    console.log('Uso: node scripts/tornar-admin.js email@exemplo.com [--remover]');
    process.exitCode = 1;
    return;
  }
  const remover = opcao === '--remover';

  const criado = await prepararBanco();
  if (criado.length) console.log('Banco atualizado:', criado.join(', '));

  const conta = await umaLinha('SELECT id, email, papel FROM Usuarios_testes WHERE email = :email', { email });
  if (!conta) {
    console.log(`Não existe conta com o e-mail ${email}. Cadastre-se primeiro em /register.`);
    process.exitCode = 1;
    return;
  }

  const papel = remover ? 'usuario' : 'admin';
  await executar('UPDATE Usuarios_testes SET papel = :papel, ativo = 1, updatedAt = NOW() WHERE id = :id', { papel, id: conta.id });
  if (remover) {
    await executar("DELETE FROM `session` WHERE JSON_VALID(`data`) AND JSON_EXTRACT(`data`, '$.user.id') = :id", { id: conta.id });
  }
  await executar("INSERT INTO admin_log (email, acao, detalhe) VALUES (:email, 'admin.promover', :detalhe)", {
    email: conta.email, detalhe: JSON.stringify({ id: conta.id, papel, via: 'scripts/tornar-admin.js' }),
  });

  console.log(remover
    ? `${conta.email} agora é usuário comum.`
    : `${conta.email} agora é administrador. Entre em /login para abrir /admin (se já estiver logado, saia e entre de novo).`);
}

main()
  .catch((e) => { console.error('Erro:', e.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
