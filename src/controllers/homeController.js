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
  res.render('cursos'); // Renderiza o arquivo cursos.ejs
};
