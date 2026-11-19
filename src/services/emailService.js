const nodemailer = require('nodemailer');

// Envio de e-mails (hoje: link de redefinição de senha).
// Configuração no .env (Gmail com senha de app):
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=tradulibras.fam@gmail.com
//   SMTP_PASS=<senha de app de 16 letras>  SMTP_FROM="TraduLibras <tradulibras.fam@gmail.com>"
// Sem SMTP_HOST/SMTP_USER/SMTP_PASS o e-mail não é enviado: o conteúdo sai no terminal (útil no ambiente local).

let transporte = null;

function smtpConfigurado() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function obterTransporte() {
  if (!transporte) {
    const porta = Number(process.env.SMTP_PORT) || 465;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: porta === 465,
      // O Google exibe a senha de app em grupos ("abcd efgh ijkl mnop"); os espaços não fazem parte dela.
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS.replace(/\s+/g, '') },
    });
  }
  return transporte;
}

async function enviarEmail({ para, assunto, texto, html }) {
  if (!smtpConfigurado()) {
    console.log(`\n[e-mail não enviado: SMTP não configurado]\nPara: ${para}\nAssunto: ${assunto}\n${texto}\n`);
    return;
  }
  await obterTransporte().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: para,
    subject: assunto,
    text: texto,
    html,
  });
}

module.exports = { enviarEmail, smtpConfigurado };
