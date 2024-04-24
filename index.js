
const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session')
const flash = require('connect-flash');
const routes = require('./routes');
const User = require('./src/models/user');
const csrf = require('csurf')
const {middlewareGlobal, checkCsrfError, csrfMiddleware } = require('./src/middlewares/middleware');
//const db = require('./src/models/db')

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

app.use(flash());

app.set('views', path.resolve(__dirname, 'src', 'views'))
app.set('view engine', 'ejs')


app.use(csrf());

//Nossos proprios middlewares
app.use(middlewareGlobal);
app.use(checkCsrfError);
app.use(csrfMiddleware);
app.use(routes);


app.listen(3306, () => {
  console.log("Servidor iniciado na porta 3306: http://localhost:3306")
});
