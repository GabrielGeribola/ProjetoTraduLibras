const express = require('express');
const app = express();

app.get("/", async (req, res) => {
  res.send("Página Inicial")
});

app.listen(3001, () => {
  console.log("Servidor iniciado na porta 8080: http://localhost:3001")
});
