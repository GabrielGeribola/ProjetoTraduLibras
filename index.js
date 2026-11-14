require('dotenv').config();

const express = require('express');
const app = express();
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize') (session.Store);
const sequelize = require('./src/config/database'); // Importe a instância do Sequelize criada anteriormente
const flash = require('connect-flash');
const cors = require('cors');


const routes = require('./routes');
const path = require('path');
const csrf = require('csurf');
const User = require('./src/models/UserModel');
const {middlewareGlobal, csrfMiddleware, checkCsrfError} = require('./src/middlewares/middleware');
const { start } = require('repl');

// Configurações iniciais
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

// Armazenamento das sessões no banco
const sessionStore = new SequelizeStore ({
  db: sequelize,
  tableName: 'session'
});

// Verificação de chave secreta
if(!process.env.SESSION_SECRET) {
  throw new Error('A variável SESSION_SECRET não foi configurada.');
}

// Configuração da sessão (NÃO CONFIGURAÇÃO DE DADOS)
const sessionOptions = session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24
  }
});


app.use(sessionOptions);
app.use(flash());

// Configuração das views
app.set('views', path.resolve(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');


//app.use(csrf());
// Middlewares próprios
app.use(middlewareGlobal);
app.use(checkCsrfError);
//app.use(csrfMiddleware);

// CORS: manter antes das rotas caso existam requisões entre origens diferentes
app.use(cors());

// rotas 
app.use(routes);


/*sequelize.sync({ alter: true })
  .then(() => console.log("Banco de dados sincronizado com sucesso!"))
  .catch((error) => console.error("Erro ao sincronizar o banco de dados:", error));*/

// 3000 é a porta exposta no Dockerfile.node (3306 é a porta do MySQL)
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await sessionStore.sync();

    app.listen(PORT, () => {
          console.log(`Servidor iniciado na porta ${PORT}: http://localhost:${PORT}`);

    });
  } catch (error) {
    console.log('Erro ao inicializar o armazenamento das sessões: ', error);
    process.exit(1);
  }
}

startServer();
