const Palavra = require('../models/Palavra');
const Video = require('../models/Video');

exports.translate = async (req, res) => {
  const { text } = req.body;

  try {
    // Separar o texto em palavras
    const palavras = text.split(' ');

    // Array para armazenar as URLs dos vídeos
    let videoUrls = [];

    // Buscar cada palavra no banco de dados
    for (let palavra of palavras) {
      const palavraEncontrada = await Palavra.findOne({
        where: { palavra: palavra },
        include: Video, // Inclui o vídeo associado
      });

      if (palavraEncontrada && palavraEncontrada.Video) {
        videoUrls.push(palavraEncontrada.Video.url); // Adiciona a URL do vídeo
      }
    }

    // Renderiza a página com os vídeos correspondentes
    res.render('home', { videoUrls });
  } catch (error) {
    console.error("Erro ao buscar palavras no banco de dados: ", error);
    return res.status(500).send('Erro ao buscar palavras no banco de dados.');
  }
};
