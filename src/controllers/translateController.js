const db = require('../config/database');
const WordsSlBr = require('../models/WordsSlBr');
const WordSplit = require('../models/WordSplit');
const AnimationUrls = require('../models/AnimationUrls');



exports.translate = async (req, res) => {
  const { text } = req.body;

try {
  // Verifica se a frase ou palavra já existe em words_sl_br
  const wordEntry = await WordsSlBr.findOne ({
    where: {description: text}
  });


  if (wordEntry) {
    // Se a palavra ou frase já existe, buscar a URL correspondente
    const video = await AnimationUrls.findOne({where: {id_animation: wordEntry.id_animation} });
    return res.render('home', {videoUrl: video.url });
  }

  const words = text.split(" ");
  const videoUrls = [];

  for (let word of words) {
    const wordData = await WordSplit.findOne({where: {word_split: word} });
    if (wordData) {
      //Busca o video da palavra
      const video = await AnimationUrls.findOne({ where: { id_animation: wordData.id_animation} });
      if (video) {
       videoUrls.push(video.url);
       }
    }
  };


  //Busca a URL da animação na tabela animation_sl_br
  const [animationRow] = await db.execute (
    'SELECT url FROM animation_sl_br WHERE id_animation = ?',
    [idAnimation]
  );

  //Se encontrou URLs para todas as palavras
  if (videoUrls.length > 0) {
    return res.render('home', {videoUrl: videoUrls[0] }); //Exibe o primeiro video (adaptar conforme a quantidade de videos)
  } else {
    return res.status(404).send('Palavra não encontrada. ');
  }
 } catch(error) {
  console.error("Erro ao buscar a tradução: ", error);
  return res.status(500).send('Erro interno ');
 }
};
