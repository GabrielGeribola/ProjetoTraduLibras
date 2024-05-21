const translate = require('../config/aws');

const translateText = async (text, sourceLanguage, targetLanguage) => {
  const params = {
    Text: text,
    SourceLanguageCode: sourceLanguage,
    TargetLanguageCode: targetLanguage
  };

  try {
    const data = await translate.translateText(params).promise();
    return data.TranslatedText;
  } catch (error) {
    console.log("Erro ao traduzir o texto: ", error);
    throw new Error("Erro ao traduzir o texto.");
  }
};

module.exports = {
  translateText
};
