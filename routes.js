const express = require('express');
const route = express.Router();
const homeController = require('./src/controllers/homeController');
const loginController = require('./src/controllers/loginController');

// Rotas da home
route.get('/', homeController.index);
route.get('/home', homeController.home);

<<<<<<< HEAD
=======
// Rota para a página de cursos
route.get('/cursos', homeController.cursos); // Adicionando a rota de cursos

// Rota para a página de ajuda
route.get('/ajuda', homeController.ajuda); // Adicionando a rota de ajuda

>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
// Rotas de login
route.get('/login/index', loginController.index);
route.post('/login/register', loginController.register);
route.post('/login/login', loginController.login);
route.get('/login/logout', loginController.logout);
route.get('/register', loginController.registerPage);

// Rotas de tradução
<<<<<<< HEAD
route.post('/translate', translateController.translate);
=======
// route.get('/translate', (req, res) => res.render('home', { originalText: '', translatedText: '' }));
// route.post('/translate', translateController.transaleAndSave);
// route.post('/translate', translateController.translate);
>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c

module.exports = route;
