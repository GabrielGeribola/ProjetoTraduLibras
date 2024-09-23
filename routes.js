const express = require('express');
const route = express.Router();
const homeController = require('./src/controllers/homeController');
const loginController = require('./src/controllers/loginController');
const translateController = require('./src/controllers/translateController');

//Rotas da home
route.get('/', homeController.index);
route.get('/home', homeController.home);

//rotas de login
route.get('/login/index', loginController.index);
route.post('/login/register', loginController.register);
route.post('/login/login', loginController.login);
route.get('/login/logout', loginController.logout);

// Rotas de tradução
route.get('/translate', (req, res) => res.render('home', { originalText: '', translatedText: '' }));
route.post('/translate', translateController.translateText);
//route.post('/translate' , translateController.transaleAndSave)


module.exports = route;
