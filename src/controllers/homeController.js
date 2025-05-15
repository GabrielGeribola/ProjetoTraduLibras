// Rota para a página inicial (index)
exports.index = (req, res) => {
  res.render('index');
};

// Rota para a página home
exports.home = (req, res) => {
  res.render('home', {originalText: '', translatedText: ''});
};

// Rota para a página de cursos
exports.cursos = (req, res) => {
  res.render('cursos');
};

// Rota para a página de ajuda
exports.ajuda = (req, res) => {
  res.render('ajuda'); // Renderiza o arquivo ajuda.ejs
};

// Rota para a página de sugestões
exports.sugestao = (req, res) => {
  res.render('sugestoes'); // Renderiza o arquivo sugestao.ejs
};

//rota para a pagina de sobre
exports.sobre = (req, res) => {
  res.render('sobre'); // Renderiza o arquivo sobre.ejs
};