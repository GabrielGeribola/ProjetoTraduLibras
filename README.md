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


<h3>Limite de tokens por plano</h3>

Cada plano tem um limite de tokens (palavras) por tradução, editado em `/admin/planos` (vazio = sem limite). Token é cada palavra: "Eu gosto de café" = 4; pontuação não conta e "guarda-chuva" conta como uma. Visitantes, contas sem plano e planos vencidos (`plano_valido_ate` antes de hoje) seguem o limite do plano Free.

O navegador não fala direto com a API Python: a tradução vai para o site (`POST /traduzir` e `POST /traduzir/voz`), que lê o plano no banco e repassa para as rotas internas da API (`/interno/traduzir` e `/interno/transcrever`, protegidas pelo `TOKEN_INTERNO`) com o limite no cabeçalho `X-Limite-Palavras`. A API conta as palavras (na voz, depois de transcrever) e responde `413` com o código `LIMITE_PLANO` se passar do limite. Por isso o `TOKEN_INTERNO` é obrigatório no `.env` do site e da API.


<h2> 🔐 Área de administração</h2>
<p>
Fica em <code>/admin</code> e só abre para contas com o papel de administrador. O administrador entra pelo login normal do site e cai direto na administração; para qualquer outra pessoa o endereço responde "página não encontrada". O primeiro administrador é criado pelo terminal (depois, os outros podem ser promovidos pela própria tela de usuários):
</p>

```
node scripts/tornar-admin.js pessoa@exemplo.com            # a conta precisa já existir (cadastro em /register)
node scripts/tornar-admin.js pessoa@exemplo.com --remover  # volta a ser usuário comum
```

| Seção | O que dá para fazer |
|---|---|
| Painel | Números gerais, situação da API de tradução, palavras mais pedidas sem sinal e últimas ações |
| Usuários | Buscar e filtrar; mudar papel, plano (com validade) e status; desativar (encerra as sessões na hora); enviar link para criar senha; criar e excluir contas |
| Palavras | Buscar sinais e ver o vídeo; renomear; adicionar sinônimo a um vídeo ("cão" → vídeo de CACHORRO); excluir; recarregar o tradutor na hora |
| Importar do S3 | Varre os buckets e lista os vídeos que ainda não estão no banco, com filtro e sinalização (palavra nova, já tem sinal, revisar o nome). Aprovar (um, os marcados ou todos) cadastra vídeo + palavra + embedding de uma vez; excluir tira da lista sem cadastrar. Também mostra os vídeos do banco cujo arquivo sumiu do S3 |
| Qualidade | Palavras pedidas sem sinal (com atalho para usar um sinal existente), sinais mais marcados como errados e últimos 👎 |
| Planos | Criar e editar os planos da página /planos (preços, limite de tokens, recursos, botão) |
| Cursos | Vídeos e artigos da página /cursos (publicar, rascunho, "Comece por aqui") e os temas |
| Banco | Tabelas, tamanho, colunas, ligações e registros, só leitura (senhas, tokens e sessões nunca aparecem) |
| Registro | Quem fez o quê na administração |

As tabelas e colunas novas são criadas sozinhas quando o servidor Node sobe (`src/config/migracoes.js`); nada existente é apagado. A importação do S3 e as embeddings usam rotas internas da API Python, protegidas pelo `TOKEN_INTERNO` (o mesmo valor no `.env` do site e da API); a leitura do S3 precisa de credenciais da AWS na API (veja `.env.example`).

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
<h3> • Área de administração: usuários, palavras, importação de vídeos do S3, planos, cursos e visão do banco;</h3>
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
