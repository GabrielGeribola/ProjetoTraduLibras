require('dotenv').config();
const express = require('express');
const app = express();
const session = require('express-session');
const flash = require('connect-flash');
const cors = require('cors');

const routes = require('./routes');
const path = require('path');
const { middlewareGlobal, checkCsrfError } = require('./src/middlewares/middleware');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

// Sessão em memória — não precisa de banco
const sessionOptions = session({
  secret: 'teste_de_chave_secreta',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 dia
});

app.use((req, res, next) => {
  res.locals.usuario = req.session?.usuario || null;
  next();
});

app.use(sessionOptions);
app.use(flash());

app.set('views', path.resolve(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

app.use(middlewareGlobal);
app.use(checkCsrfError);
app.use(cors());
app.use(routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}: http://localhost:${PORT}`);
});