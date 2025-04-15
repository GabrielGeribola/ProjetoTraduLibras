const express = require('express');
const route = express.Router();
const next = require("next");
const homeController = require('./src/controllers/homeController');
const loginController = require('./src/controllers/loginController');


// Rotas da API
route.get("/api/home", homeController.index);
route.get("/api/login", loginController.index);

//Rotas da home
//route.get('/', homeController.index);
//route.get('/home', homeController.home);

//rotas de login
route.get('/login/index', loginController.index);
route.post('/login/register', loginController.register);
route.post('/login/login', loginController.login);
route.get('/login/logout', loginController.logout);

// Rotas não-API direcionadas ao Next.js
const app = next({ dev: process.env.NODE_ENV !== "main" });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  route.all("*", (req, res) => handle(req, res));
});



module.exports = route;
