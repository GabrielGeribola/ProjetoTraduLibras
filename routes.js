const express = require('express');
const route = express.Router();
const homeController = require('./src/controllers/homeController');
const loginController = require('./src/controllers/loginController');
const historicoController = require('./src/controllers/historicoController');
const feedbackController = require('./src/controllers/feedbackController');
const senhaController = require('./src/controllers/senhaController');
const adminRoutes = require('./src/routes/admin');
const {
  loginRequired, limiteLogin, limiteCadastro, limiteSenha, limiteFeedback,
} = require('./src/middlewares/middleware');

// Páginas
route.get('/', homeController.home);
route.get('/home', homeController.home);
route.get('/cursos', homeController.cursos);
route.get('/ajuda', homeController.ajuda);
route.get('/sugestoes', homeController.sugestao);
route.get('/sobre', homeController.sobre);
route.get('/planos', homeController.planos);

// Login (com limite de tentativas)
route.get('/login', loginController.index);
route.post('/login', limiteLogin, loginController.login);
route.post('/logout', loginController.logout);

// Cadastro (com limite de tentativas)
route.get('/register', loginController.registerPage);
route.post('/register', limiteCadastro, loginController.register);

// Esqueci a senha: pede o link por e-mail e cria a nova senha pelo link
route.get('/esqueci-senha', senhaController.esqueciPage);
route.post('/esqueci-senha', limiteSenha, senhaController.esqueci);
route.get('/redefinir-senha/:token', senhaController.redefinirPage);
route.post('/redefinir-senha/:token', limiteSenha, senhaController.redefinir);

// Histórico: visível para todos; o conteúdo só aparece para quem está logado
route.get('/historico', historicoController.index);
route.post('/historico', historicoController.salvar); // responde 401 em JSON se não estiver logado
route.post('/historico/:id/excluir', loginRequired, historicoController.excluir);

// Feedback das traduções (salvo por usuário; visitante guarda só no navegador)
route.post('/feedback', limiteFeedback, feedbackController.salvar); // responde 401 em JSON se não estiver logado
route.post('/feedback/exclusoes/restaurar', loginRequired, feedbackController.restaurar);

// Área de administração (só para contas com papel 'admin')
route.use('/admin', adminRoutes);

module.exports = route;
