require('dotenv').config();
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });
const express = require('express');
const app = express();
const next = require("next");
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize') (session.Store);
const sequelize = require('./src/config/database'); // Importe a instância do Sequelize criada anteriormente
const flash = require('connect-flash');


const dev = process.env.NODE_ENV !== "produmainction";
const index = next({ dev });
const handle = index.getRequestHandler();

const routes = require('./routes');
const path = require('path');
const csrf = require('csurf');
const User = require('./src/models/UserModel');
const {middlewareGlobal, csrfMiddleware, checkCsrfError} = require('./src/middlewares/middleware');


app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));
// Middleware para servir React
app.use(express.static(path.join(__dirname, "build")));

const sessionStore = new SequelizeStore ({
  db: sequelize,
  tableName: 'session'
});

// CONFIGURAÇÃO DE CONEXÃO BD (NÃO CONFIGURAÇÃO DE DADOS)
const sessionOptions = session({
  secret:'teste_de_chave_secreta',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
});

// Inicializa o armazenamento da sessão antes de usar no aplicativo

sessionStore.sync();

app.use(sessionOptions);

app.use(flash());


app.set('views', path.resolve(__dirname, 'src', 'views'));
app.set('view engine', 'ejs', 'jsx');


//app.use(csrf());
//Nossos proprios middlewares
app.use(middlewareGlobal);
app.use(checkCsrfError);
//app.use(csrfMiddleware);

app.use(routes);

index.prepare().then(() => {
  const server = express();

  // Middleware para rotas da API
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

  // Rotas Express
  server.use("/", require("./routes"));

  // Rotas que não são da API
  server.all("*", (req, res) => {
    return handle(req, res); // Deixa o Next.js processar
  });

  app.listen(3306, () => {
    console.log("Servidor iniciado na porta 3306: http://localhost:3306")
  });

});




