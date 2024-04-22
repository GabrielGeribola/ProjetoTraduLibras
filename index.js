
const express = require('express');
const app = express();
const path = require('path');
const routes = require('./src/routes/routes');
const User = require('./src/models/user');

//const db = require('./src/models/db')

app.set('views', path.resolve(__dirname, 'src', 'views'))
app.set('view engine', 'ejs')
app.use(express.static(path.resolve(__dirname, 'public')));

app.use(routes);

app.get("/teste", async (req, res) => {
  res.send('Database')
});

app.get("/cadastrar", async (req, res) => {
  res.send('Pagina cadastrar')
});


app.listen(3306, () => {
  console.log("Servidor iniciado na porta 3306: http://localhost:3306")
});
