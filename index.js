const express = require('express');
const app = express();

const db = require('./src/models/db')

app.get("/", async (req, res) => {
  res.send("Página Inicial- database")
});

app.listen(3001, () => {
  console.log("Servidor iniciado na porta 8080: http://localhost:3001")
});
