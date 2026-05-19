const express = require('express');
const route = express.Router();
const homeController = require('./src/controllers/homeController');
const loginController = require('./src/controllers/loginController');


// Rotas da home
route.get('/', homeController.home);
route.get('/home', homeController.home);

// Rota para a página de cursos
route.get('/cursos', homeController.cursos); // Adicionando a rota de cursos

// Rota para a página de ajuda
route.get('/ajuda', homeController.ajuda); // Adicionando a rota de ajuda

// Rota para a página de sugestao
route.get('/sugestoes', homeController.sugestao); // Adicionando a rota de sugestao

//rota para a pagina de sobre
route.get('/sobre', homeController.sobre); // Adicionando a rota de sobre

// Login
route.get('/login', loginController.index);
route.post('/login', loginController.login);
route.get('/logout', loginController.logout);

// Registro
route.get('/register', loginController.registerPage);
route.post('/register', loginController.register);

// Rotas de tradução
// route.get('/translate', (req, res) => res.render('home', { originalText: '', translatedText: '' }));
// route.post('/translate', translateController.transaleAndSave);
// route.post('/translate', translateController.translate);

module.exports = route;
