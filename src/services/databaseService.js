const WordSlBr = require('../models/WordsSlBr');
const WordSplit = require('../models/WordSplit');
const AnimationUrls = require('../models/AnimationUrls');

//Função pra salvar significado e associar vídeo
async function saveSignificado(texto, videoUrl) {
  const video = await AnimationUrls.findOne({where: {url: videoUrl} });
  if (!video) {
    throw new Error('Url de video não encontrada. ');
  }

  await WordSlBr.create({
    description: texto,
    id_animation: video.id_animation,
    d_variable: null // Dummy variables a serem processadas
  });
};

module.exports = {saveSignificado};
