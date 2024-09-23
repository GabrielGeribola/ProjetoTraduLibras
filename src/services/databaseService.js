const videoModel = require('../models/videoModel');
const significadoModel = require('../models/significadoModel');

async function saveSignificado(texto, videoUrl) {
  let video = await videoModel.getVideoByUrl(videoUrl);
  if (!video) {
    const videoId = await videoModel.insertVideo(videoUrl);
    video = { id: videoId };
  }

  const existingSignificado = await significadoModel.getSignificadoByTexto(texto);
  if (!existingSignificado) {
    await significadoModel.insertSignificado(texto, video.id);
  }
}

module.exports = { saveSignificado };
