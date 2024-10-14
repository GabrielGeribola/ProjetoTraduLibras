const db = require('../config/database');
const WordsSlBr = require('../models/WordsSlBr');
const WordSplit = require('../models/WordSplit');
const AnimationUrls = require('../models/AnimationUrls');



exports.translate = async (req, res) => {

  res.render('home', {videoUrl: undefined});
  const { text } = req.body;

  try {
    const wordEntry = await WordsSlBr.findOne({
      where: { description: text }
    });

    if (wordEntry) {
      // Busca a URL do vídeo correspondente
      const video = await AnimationUrls.findOne({ where: { id_animation: wordEntry.id_animation } });
      return res.render('home', { videoUrl: video ? video.url : null });
    }

    // Split da frase em palavras
    const words = text.split(" ");
    const videoUrls = [];

    for (let word of words) {
      const wordData = await WordSplit.findOne({ where: { word_split: word } });
      if (wordData) {
        const video = await AnimationUrls.findOne({ where: { id_animation: wordData.id_animation } });
        if (video) {
          videoUrls.push(video.url);
        }
      }
    }

    if (videoUrls.length > 0) {
      // Renderiza o primeiro vídeo encontrado ou todos se quiser modificar
      return res.render('home', { videoUrl: videoUrls[0] });
    } else {
      return res.render('home', { videoUrl: null });
    }

  } catch (error) {
    console.error("Erro ao buscar a tradução:", error);
    return res.status(500).send('Erro interno.');
  }
};
