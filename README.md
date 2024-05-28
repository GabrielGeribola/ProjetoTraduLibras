<h1 align="center"> 💻 TRADULIBRAS: CONVERSAÇÃO ENTRE SURDOS E NÃO SURDOS VIA APLICATIVO MOBILE </h1>
<p> O projeto Tradulibras é uma aplicação web desenvolvida com o objetivo de oferecer um tradutor de texto integrado com a API AWS Translate. Este projeto permite que os usuários traduzam texto de um idioma para outro de forma rápida e eficiente. A interface é projetada para ser intuitiva e amigável, oferecendo também recursos adicionais como login, logout e um menu interativo. </p>

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


<h2> 🛠 Configuração e Instalação </h2>

<p> 1- Clone o repositório </p>

```
git clone https://github.com/GabrielGeribola/Tradulibras.git
```
<p>2- Instale as dependências, acesse a pasta do projeto e abra no vscode, no terminal dele faça: </p>

```
npm install
```

<p>3- Configure as variáveis de ambiente no arquivo '.env:'</p>

```
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=your_aws_region
```

<p>4- Inicie a aplicação: </p>

```
npm run dev
```


<h2>💡 Como funciona</h3>
<p>- O usuário acessa a aplicação e é direcionado para a página inicial.</p>
<p>- Na página inicial, o usuário pode digitar um texto no campo designado e efetuar a tradução. </p>
<p>- O sistema faz uma chamada à API AWS Translate e exibe a tradução na tela.</p>
<p>- O usuário pode fazer login para acessar funcionalidades personalizadas (como acessar as apostilas e video aulas disponiveis).</p>


<h2> Licença </h2>
<p>Este projeto está licenciado sob a MIT License. Veja o arquivo <a href="https://github.com/GabrielGeribola/ProjetoTraduLibras?tab=MIT-1-ov-file#readme">LICENSE</a> para mais detalhes. </p>
