const axios = require('axios');

exports.translate = async (req, res) => {
    const { text } = req.body;

    if (!text || text.trim() === "") {
        return res.status(400).json({ mensagem: "Entrada inválida!" });
    }

    try {
        // Envie a requisição para o endpoint Flask
        const response = await axios.post('http://localhost:5000/translate', { palavra: text });
<<<<<<< HEAD
        
=======

>>>>>>> 02274f59c54a7257af59ef3f56eccd64b63a027c
        // Retorne a resposta recebida do Flask
        return res.json(response.data);
    } catch (error) {
        console.error("Erro ao fazer a requisição para o backend Python:", error);
        return res.status(500).send('Erro interno ao buscar tradução.');
    }
};

