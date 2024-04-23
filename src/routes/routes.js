const express = require('express');
const route = express.Router();
const homeController = require('../controllers/homeController');
const loginController = require('../controllers/loginController');

//Rotas da home
route.get('/', homeController.index);
//route.get('/home.ejs', homeController.paginaHome);

//rotas de login
route.get('/login/index', loginController.index)

module.exports = route;
