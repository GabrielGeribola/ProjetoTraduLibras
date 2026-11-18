<h1 align="center"> 💻 TRADULIBRAS: CONVERSAÇÃO ENTRE SURDOS E NÃO SURDOS VIA APLICATIVO MOBILE </h1>
<h2> 📌 Sobre o projeto </h2>
<p> O TraduLibras é uma aplicação voltada à inclusão e acessibilidade, desenvolvida para realizar a tradução de textos em português para Libras (Língua Brasileira de Sinais), atendendo tanto pessoas surdas quanto não surdas.

O sistema realiza o processamento do texto de entrada, identificando palavras e expressões a partir de uma base de aproximadamente 4.200 palavras e expressões em Libras (cerca de 4.800 vídeos) e utilizando técnicas de Processamento de Linguagem Natural (PLN) para encontrar correspondências entre o texto informado e os conteúdos cadastrados.

Após a identificação das expressões, o sistema associa cada resultado ao seu respectivo conteúdo visual em Libras, permitindo a reprodução da tradução por meio de um intérprete virtual.
</p>

<h2> 🔎 Como a tradução funciona</h2>
<p>
A frase passa por uma glosa (spaCy): saem artigos, preposições e verbos de ligação ("eu sou lindo" → EU LINDO), pronomes oblíquos viram sujeito ("te amo" → VOCÊ) e a ordem fica mais próxima da Libras. Expressões do banco com mais de uma palavra ("por favor", "café da manhã") têm prioridade. Cada termo é procurado do jeito mais confiável para o menos confiável, parando no primeiro acerto:
</p>

1. sinal exato (ignorando acentos e maiúsculas);
2. sinônimo cadastrado em `dados_traducao/sinonimos.json`;
3. lema / infinitivo ("bebe" → BEBER);
4. variações simples que existam no banco (plural, feminino, diminutivo: "linda" → LINDO, "casinha" → CASA);
5. correção de digitação, **só** para o que não é palavra do português ("carru" → CARRO);
6. nomes próprios são soletrados (datilologia).

Se nada for confiável, a palavra fica sem sinal e aparece como "Ainda sem sinal" — um sinal errado é pior do que nenhum. Palavras reais nunca são trocadas por outra parecida (antes, "linda" virava AINDA e "dois" virava COISA). As palavras sem sinal são contadas na tabela `termos_sem_sinal`, que serve de lista de prioridades para gravar sinais novos.

<h3>Qualidade medida</h3>

`python scripts/avaliar_traducao.py --detalhes` roda frases com o resultado esperado e os 271 testes da tabela `validation_metrics`. O número mais importante é "sinais errados". Resultado nas frases de controle (que nunca foram usadas para ajustar o tradutor):

| | versão anterior | versão atual |
|---|---|---|
| sinais certos entre os mostrados (precisão) | 77,6% | 99,5% |
| sinais esperados encontrados (cobertura) | 86,2% | 98,2% |
| testes da `validation_metrics` | 74,5% | 100% |


<h2> ⚙️ Principais funcionalidades</h2>
<p> 
<h3> • Tradução de textos em português para Libras;</h3>
<h3> • Processamento e normalização do texto de entrada;</h3>
<h3> • Busca e correspondência de palavras e expressões na base de dados;</h3>
<h3> • Busca em etapas (exato, sinônimos, lemas, variações, correção de digitação), preferindo "sem sinal" a um sinal errado;</h3>
<h3> • Soletração (datilologia) de nomes próprios;</h3>
<h3> • Utilização de técnicas de Processamento de Linguagem Natural (PLN);</h3>
<h3> • Associação das expressões encontradas aos respectivos conteúdos em Libras;</h3>
<h3> • Reprodução das traduções por meio de animações/vídeos de Libras;</h3>
<h3> • Glossário organizado por segmentos;</h3>
<h3> • Interface desenvolvida com foco em acessibilidade e usabilidade.</h3>

O projeto encontra-se em desenvolvimento, com foco na evolução do processo de tradução, aumento da precisão das correspondências e ampliação da base de expressões em Libras. </p>
<h2> 🛠 Tecnologias </h2>

<h3 align="left">
    <a href="https://nodejs.org/en">🔗 NodeJs</a>
</h3>
<p align="left">🟢 Para o backend e gerenciamento de rotas.</p>

<h3 align="left">
    <a href="https://expressjs.com">🔗 Express</a>
</h3>
<p align="left">🚀 Para o backend e gerenciamento de rotas.</p>


<h3 align="left">
    <a href="https://ejs.co">🔗 EJS</a>
</h3>
<p align="left">📄 Para a renderização de páginas HTML.</p>


<h3 align="left">
    <a href="https://aws.amazon.com/pt/translate/">🔗 AWS Translate</a>
</h3>
<p align="left">📝 Para os serviços de tradução de texto.</p>
