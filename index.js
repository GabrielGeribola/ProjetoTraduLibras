
const express = require('express');
const app = express();
const path = require('path');
const routes = require('./routes');

const db = require('./src/models/db')

app.set('views', path.resolve(__dirname, 'src', 'views'))
app.set('view engine', 'ejs')

app.use(routes);

app.get("/teste", async (req, res) => {
  res.send('Database')
});

app.listen(3001, () => {
  console.log("Servidor iniciado na porta 3001: http://localhost:3001")
});
