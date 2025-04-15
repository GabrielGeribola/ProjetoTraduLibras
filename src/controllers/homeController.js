exports.index = (req, res) => {
  res.render('/home');
};

/*exports.index = async (req, res) => {
  res.json({ message: "Bem-vindo ao Tradulibras API" });
};*/


exports.home = (req, res) => {
  res.render('home', {originalText: '', translatedText: ''});
};



