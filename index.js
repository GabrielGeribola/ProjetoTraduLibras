require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const sequelize = require('./src/config/database');
const routes = require('./routes');
const { middlewareGlobal, csrfToken, csrfProtection } = require('./src/middlewares/middleware');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Atrás de proxy (nginx/load balancer) o IP real vem no X-Forwarded-For.
// Necessário para o limite de tentativas de login funcionar por usuário, e não pelo IP do proxy.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// Cabeçalhos de segurança. As views usam <script> inline, por isso 'unsafe-inline' em script-src.
// A API Python roda em outra origem no ambiente local (http://localhost:5000).
const origemApi = process.env.API_ORIGIN || (isProd ? '' : 'http://localhost:5000');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'https:'],
      'media-src': ["'self'", 'https:', 'blob:'],
      'connect-src': ["'self'", origemApi].filter(Boolean),
      // Player dos vídeos da página Cursos (modo sem cookies do YouTube)
      'frame-src': ["'self'", 'https://www.youtube-nocookie.com'],
      'upgrade-insecure-requests': isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Compressão gzip (ex.: glossario.json cai de ~670 KB para ~60 KB)
app.use(compression());

// CORS: manter antes das rotas caso existam requisições entre origens diferentes
app.use(cors());

// Configurações iniciais
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Arquivos estáticos com cache no navegador em produção
app.use(express.static(path.resolve(__dirname, 'public'), {
  maxAge: isProd ? '7d' : 0,
}));

// Armazenamento das sessões no banco
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'session'
});

// Verificação de chave secreta
if (!process.env.SESSION_SECRET) {
  throw new Error('A variável SESSION_SECRET não foi configurada.');
}

// Configuração da sessão (NÃO CONFIGURAÇÃO DE DADOS)
app.use(session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 24
  }
}));
app.use(flash());

// Configuração das views
app.set('views', path.resolve(__dirname, 'src', 'views'));
app.set('view engine', 'ejs');

// Middlewares próprios
app.use(middlewareGlobal);
app.use(csrfToken);
app.use(csrfProtection);

// Rotas
app.use(routes);

// Página 404 para rotas inexistentes
app.use((req, res) => {
  res.status(404).render('404', {
    titulo: 'Página não encontrada',
    mensagem: 'A página que você procura não existe ou mudou de endereço.',
  });
});

// Tratamento geral de erros (sem expor detalhes internos ao usuário)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const corpoInvalido = err.type === 'entity.parse.failed' || err.type === 'entity.too.large';
  const status = corpoInvalido ? 400 : 500;
  if (!corpoInvalido) console.error('Erro inesperado:', err);

  if (res.headersSent) return;
  if (req.accepts(['html', 'json']) === 'json') {
    return res.status(status).json({
      status: 'error',
      codigo: corpoInvalido ? 'REQUISICAO_INVALIDA' : 'ERRO_INTERNO',
      mensagem: corpoInvalido ? 'Requisição inválida.' : 'Erro interno no servidor.',
    });
  }
  return res.status(status).render('404', {
    titulo: corpoInvalido ? 'Requisição inválida' : 'Algo deu errado',
    mensagem: 'Não foi possível concluir sua solicitação. Tente novamente em instantes.',
  });
});

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
