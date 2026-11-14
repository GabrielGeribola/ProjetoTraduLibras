const express = require('express');
const route = express.Router();
const homeController = require('./src/controllers/homeController');
const loginController = require('./src/controllers/loginController');
const historicoController = require('./src/controllers/historicoController');
const { loginRequired, limiteLogin, limiteCadastro } = require('./src/middlewares/middleware');

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

// Histórico de traduções (somente usuário logado)
route.get('/historico', loginRequired, historicoController.index);
route.post('/historico', historicoController.salvar); // responde 401 em JSON se não estiver logado
route.post('/historico/:id/excluir', loginRequired, historicoController.excluir);

module.exports = route;
