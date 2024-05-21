const translateService = require('../services/translateService');

exports.translateText = async (req, res) => {
  const { text, sourceLanguage, targetLanguage } = req.body;

  try {
    const translatedText = await translateService.translateText(text, sourceLanguage, targetLanguage);
    res.render('home', { originalText: text, translatedText });
  } catch (error) {
    console.log('Erro ao traduzir o texto: ', error);
    req.flash('errors', 'Erro ao traduzir o texto.');
    req.session.save(() => res.redirect('back'));
  }
};
