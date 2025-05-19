// Rota para a página inicial (index)
exports.index = (req, res) => {
  res.render('index');
};

// Rota para a página home
exports.home = (req, res) => {
  res.render('home', {originalText: '', translatedText: ''});
};

// Rota para a página de cursos
exports.cursos = (req, res) => {
  const artigos = [
    {
      titulo: 'A educação das pessoas surdas no Brasil.',
      descricao: 'Analisa os impactos da Lei nº 10.436/2002 na educação de surdos.',
      link: 'https://www.scielo.br/j/edur/a/Qqr4YJpLGLKncgGNG4RnWNG/'
    },
    {
      titulo: 'Libras e Formação Docente.',
      descricao: 'Da Constatação à Superação de Hierarquias - Discute a inserção e o papel da disciplina de Libras na formação de professores.',
      link: 'https://www.scielo.br/j/rbee/a/q4YtCpbt9bmYH6GdsbbpnHc/'
    },{
      titulo: 'Identidade, cultura surda e produção de subjetividades e educação.',
      descricao: 'Atravessamentos e implicações sociais - Aborda a relação entre identidade surda, cultura e processos educativos.',
      link: 'https://www.scielo.br/j/pcp/a/gwqgpPLXRVQWSfVVrLd8WsS/'
    },{
      titulo: 'Inclusão de alunos surdos.',
      descricao: 'Desafios e necessidades do docente - Explora os desafios enfrentados por professores na inclusão de alunos surdos e a necessidade de formação adequada.',
      link: 'https://www.redalyc.org/journal/684/68470348039/68470348039.pdf'
    },{
      titulo: 'Educação de Surdos.',
      descricao: 'Reflexões Teóricas sobre Práticas da Educação Social para a Inclusão - Apresenta reflexões sobre a educação social e sua contribuição para a inclusão de pessoas surdas.',
      link: 'https://portaleducacao.anapolis.go.gov.br/revistaanapolis/wp-content/uploads/2022/09/TEXTO-9-EDUCACAO-DE-SURDOS-REFLEXOES-TEORICAS-SOBRE-PRATICAS-DA-EDUCACAO-SOCIAL-PARA-A-INCLUSAO.pdf'
    },{
      titulo: 'MATERIAL DIDÁTICO PARA SURDOS E OUVINTES.',
      descricao: 'Uma perspectiva inclusiva no ensino de Ciências - Discute a criação e o uso de materiais didáticos acessíveis para alunos surdos e ouvintes no ensino de Ciências.',
      link: 'https://periodicosonline.uems.br/index.php/educacaoculturalinguagem/article/view/7506'
    },{
      titulo: 'BILÍNGUISMO PEDAGÓGICO PARA SURDOS – POR QUE ESSA IDEIA É TÃO DEFENDIDA ENTRE A COMUNIDADE SURDA?',
      descricao: 'Examina os fundamentos e a importância do bilinguismo na educação de surdos sob a ótica da comunidade surda.',
      link: 'https://www.unicesumar.edu.br/epcc-2013/wp-content/uploads/sites/82/2016/07/Anderson_Rafael_Siqueira_Nascimento.pdf'
    },{
      titulo: 'A educação dos surdos no brasil.',
      descricao: 'Aspectos históricos e a evolução da filosofia educacional especial - Apresenta um panorama histórico da educação de surdos no Brasil e as diferentes abordagens pedagógicas.',
      link: 'https://www.revistas.fucamp.edu.br/index.php/cadernos/article/view/1770/1161'
    },{
      titulo: 'Lei nº 14.191, de 3 de agosto de 2021. ',
      descricao: 'Texto referente a que altera a LDB para dispor sobre a modalidade de educação bilíngue de surdos.',
      link: 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14191.htm'
    },{
      titulo: 'TECNOLOGIAS ASSISTIVAS PARA O ENSINO DE LIBRAS - SOLUÇÕES INOVADORAS PARA A EDUCAÇÃO INCLUSIVA. ',
      descricao: 'Aborda o uso de tecnologias assistivas como ferramenta para o ensino de Libras e a inclusão.',
      link: 'https://ojs.focopublicacoes.com.br/foco/article/view/6576'
    },{
      titulo: 'Avaliação como instrumento de inclusão de alunos surdos na educação básica.',
      descricao: 'Discute a importância da avaliação adaptada para o processo de inclusão de alunos surdos.',
      link: 'https://ojs.revistacontribuciones.com/ojs/index.php/clcs/article/download/10706/6407/31592'
    },{
      titulo: 'A importância da formação docente para a Educação de Surdos nos ambientes educacionais.',
      descricao: 'Destaca a relevância da formação específica de professores para atuar com alunos surdos.',
      link: 'https://educacaopublica.cecierj.edu.br/artigos/23/20/a-importancia-da-formacao-docente-para-a-educacao-de-surdos-nos-ambientes-educacionais'
    },{
      titulo: 'Educação Bilíngue, Identidades e Culturas Surdas.',
      descricao: 'Em busca de um norte em Cruzeiro do Sul - Analisa aspectos das identidades e cultura surda no contexto da educação bilíngue.',
      link: 'https://tede.ufam.edu.br/bitstream/tede/5040/2/Disserta%C3%A7%C3%A3o%20-%20Maria%20Aldenora%20dos%20Santos%20Lima.pdf'
    },{
      titulo: 'Família e escola na aprendizagem do aluno surdo',
      descricao: 'Aborda o papel fundamental da família e da escola no processo de aprendizagem do aluno surdo.',
      link: 'https://multivix.edu.br/wp-content/uploads/2019/04/familia-e-escola-na-aprendizagem-do-aluno-surdo.pdf'
    },{
      titulo: 'Estudantes surdos na escola comum - Desafios para a educação bilíngue.',
      descricao: 'Discute os desafios da implementação da educação bilíngue para estudantes surdos em escolas regulares.',
      link: 'https://repositorio.ufmg.br/bitstream/1843/68162/2/Estudantes%20surdos%20na%20escola%20comum_%20desafios%20para%20a%20educa%C3%A7%C3%A3o%20bil%C3%ADngue..pdf'
    },{
      titulo: 'Letramento e surdez: A visualização das palavras.',
      descricao: 'Propõe um olhar sobre o letramento de alunos surdos com foco no aspecto visual da leitura-escrita.',
      link: 'https://periodicos.sbu.unicamp.br/ojs/index.php/etd/article/download/796/811/851'
    },{
      titulo: 'PRÁTICAS PEDAGÓGICAS INCLUSIVAS PARA ALUNOS SURDOS EM ATENDIMENTO EDUCACIONAL ESPECIALIZADO.',
      descricao: 'Relata experiências de práticas pedagógicas inclusivas para alunos surdos no AEE.',
      link: 'https://periodicos.ufac.br/index.php/COMMUNITAS/article/download/6029/3739/20681'
    },{
      titulo: 'Recursos Tecnológicos na Educação Bilíngue de Estudantes Surdos.',
      descricao: 'Examina o uso de recursos tecnológicos no contexto da educação bilíngue para estudantes surdos.',
      link: 'https://www.scielo.br/j/edreal/a/XjyRJtDLTwVh3dxVrkL3cBm/'
    },{
      titulo: 'A importância da formação superior em pedagogia bilíngue para a educação de surdos.',
      descricao: 'Argumenta sobre a necessidade da formação em pedagogia bilíngue para profissionais que atuam com educação de surdos.',
      link: 'https://revistas.ufpr.br/nep/article/download/49567/29657'
    },{
      titulo: 'O PROFESSOR E OS DESAFIOS NO ENSINO DA LÍNGUA PORTUGUESA PARA SURDOS.',
      descricao: 'Aborda os desafios e as estratégias para o ensino de português como segunda língua para alunos surdos.',
      link: 'https://revistas.uneb.br/index.php/encantar/article/view/7994/pdf'
    },{
      titulo: 'O ensino de libras para estudantes ouvintes como um meio de inclusão de surdos.',
      descricao: 'Analisa a relevância do ensino de Libras para estudantes ouvintes como forma de promover a inclusão de surdos.',
      link: 'https://periodicoscientificos.ufmt.br/revistapanoramica/index.php/revistapanoramica/article/view/1531/19192650'
    },{
      titulo: 'POLÍTICAS PÚBLICAS E EDUCAÇÃO DE SURDOS - NA TERRITORIALIDADE DAS NEGOCIAÇÕES.',
      descricao: 'Discute as políticas públicas voltadas para a educação de surdos no Brasil',
      link: 'https://www.bage.ideau.com.br/wp-content/files_mf/7d5ec4aa8aa18deb9fd374a6e2c64d47249_1.pdf'
    },{
      titulo: 'O surdo e suas relações sociais.',
      descricao: 'Reflete sobre as interações sociais da pessoa surda e o papel das associações.',
      link: 'https://professor.pucgoias.edu.br/sitedocente/admin/arquivosUpload/17962/material/O%20surdo%20e%20suas%20rela%C3%A7%C3%B5es%20sociais.pdf'
    },{
      titulo: 'Fundamentos da língua brasileira de sinais.',
      descricao: 'Apresenta os princípios básicos da Libras e sua importância para a comunidade surda.',
      link: 'https://proen.ifmt.edu.br/media/filer_public/9f/1b/9f1b65e0-c6c0-4d96-a9e3-915421d3a95a/fundamentos_da_lingua_braileira_de_sinais_-_libras.pdf'
    },{
      titulo: 'A LIBRAS NA LEI E NA PRÁTICA ESCOLAR.',
      descricao: 'O que temos e o que precisamos - Analisa a aplicação da legislação sobre Libras no contexto escolar.',
      link: 'https://periodicos.furg.br/momento/article/view/14382'
    },{
      titulo: 'Educação Especial: Os desafios da inclusão de alunos surdos no contexto escolar.',
      descricao: 'Discute os obstáculos para a inclusão de alunos surdos e o papel da educação especial.',
      link: 'https://educacaopublica.cecierj.edu.br/artigos/22/18/educacao-especial-os-desafios-da-inclusao-de-alunos-surdos-no-contexto-escolar'
    },{
      titulo: 'METODOLOGIAS UTILIZADAS NA EDUCAÇÃO DE SURDOS NO BRASIL.',
      descricao: 'Explora diferentes metodologias de ensino aplicadas na educação de surdos no país.',
      link: 'http://www.editorarealize.com.br/editora/anais/join/2019/TRABALHO_EV124_MD1_SA70_ID1887_23082019235854.pdf'
    },{
      titulo: 'Cultura escolar, cultura surda e construção de identidades na escola.',
      descricao: 'Reflete sobre a interação entre a cultura escolar e a cultura surda na formação da identidade do aluno surdo.',
      link: 'https://www.scielo.br/j/rbee/a/L75D5S73FqPJLRt8PzhP6rr/'
    },{
      titulo: 'Materiais Didáticos para Surdos: Entre os Remendos das Adaptações e a Potencialidade das Criações',
      descricao: 'Analisa a produção de materiais didáticos para surdos, desde adaptações até a criação de conteúdos específicos.',
      link: 'https://www.researchgate.net/publication/373292314'
    },{
      titulo: 'Materiais Didáticos para Surdos: Entre os Remendos das Adaptações e a Potencialidade das Criações',
      descricao: 'Examina a função do intérprete de Libras na mediação do processo educativo de alunos surdos.',
      link: 'https://educacaopublica.cecierj.edu.br/artigos/17/14/o-papel-do-intrprete-de-libras-no-processo-de-ensino-aprendizagem-do-a-aluno-a-surdo-a'
    }



  ];

  const videos = [
    {
      titulo: 'Curso de Libras | Alfabeto Manual | com professora surda',
      descricao: 'Vídeo aula que ensina o alfabeto manual em Libras com uma professora surda.',
      link: 'https://www.youtube.com/watch?v=EaE7R1VBBiA',

    },
    {
      titulo: 'Libras para crianças: Sinais e Educação Infantil',
      descricao: 'Vídeo educativo com sinais básicos em Libras voltado para crianças, abordando vocabulário do dia a dia e família.',
      link: 'https://www.youtube.com/watch?v=QCv2wkDBG58'
    },
    {
      titulo: 'Gramática da Libras: Como criar frases',
      descricao: 'Explica conceitos básicos da gramática da Libras e como construir frases.',
      link: 'https://www.youtube.com/watch?v=wOYFioBXqGI'
    },
    {
      titulo: 'Classificadores em Libras: O que é e como usar',
      descricao: 'Apresenta o conceito e exemplos de classificadores na Libras.',
      link: 'https://www.youtube.com/watch?v=8eXiTW60img'
    },
    {
      titulo: '30 Sinais em Libras para a Área da Saúde',
      descricao: 'Ensina vocabulário de Libras focado na área da saúde.',
      link: 'https://www.youtube.com/watch?v=Xuh6I6wLsTg'
    },
    {
      titulo: 'Libras para a Área Jurídica',
      descricao: 'Introduz vocabulário de Libras utilizado no contexto jurídico.',
      link: 'https://www.youtube.com/watch?v=vYVCzcjAw1U'
    },
    {
      titulo: 'Cores em Libras',
      descricao: 'Ensina os sinais das cores em Libras para iniciantes.',
      link: 'https://www.youtube.com/watch?v=8CGSZs8eSNU'
    },
    {
      titulo: 'Animais em Libras',
      descricao: 'Apresenta o vocabulário de animais em Libras.',
      link: 'https://www.youtube.com/watch?v=KGnE061jdxw'
    },
    {
      titulo: 'Curso de Libras – Alimentos',
      descricao: 'Ensina vocabulário relacionado a alimentos em Libras.',
      link: 'https://www.youtube.com/watch?v=OLHC2OjkODI'
    },
    {
      titulo: 'Datilologia - Alfabeto Manual (1/7)',
      descricao: 'Primeira parte de uma série sobre o alfabeto manual e datilologia em Libras.',
      link: 'https://www.youtube.com/watch?v=4He1bn2L2DY'
    },
    {
      titulo: 'Pessoas Surdas no Mercado de Trabalho',
      descricao: 'Vídeo sobre a inclusão e os desafios das pessoas surdas no mercado de trabalho.',
      link: 'https://www.youtube.com/watch?v=Zp8cDJCyB_o'
    },
    {
      titulo: 'Educação Inclusiva: o que é?',
      descricao: 'Explica o conceito de educação inclusiva, relevante para a educação de surdos.',
      link: 'https://www.youtube.com/watch?v=rcqG3K1F4nQ'
    },
    {
      titulo: 'A Cultura Surda',
      descricao: 'Apresenta aspectos da cultura surda.',
      link: 'https://www.youtube.com/watch?v=i_d3_k4Z_0c'
    },
    {
      titulo: 'História da Educação dos Surdos no Brasil',
      descricao: 'Conta a trajetória histórica da educação de surdos no país.',
      link: 'https://www.youtube.com/watch?v=OID0Wd4_02s'
    },
    {
      titulo: 'Vocabulário Básico de Libras (Saudações)',
      descricao: 'Ensina as saudações básicas em Libras.',
      link: 'https://www.youtube.com/watch?v=N1B9b1-Hh1Y'
    },
    {
      titulo: 'Como se comunicar com pessoas surdas',
      descricao: 'Dicas práticas de comunicação com a comunidade surda.',
      link: 'https://www.youtube.com/watch?v=0Q4z3c_c7PA'
    },
    {
      titulo: 'O que é ser Surdo?',
      descricao: 'Explana sobre a identidade e a vivência da pessoa surda.',
      link: 'https://www.youtube.com/watch?v=ky3-G6M15b0'
    },
    {
      titulo: 'Direitos da Pessoa Surda',
      descricao: 'Informa sobre os direitos assegurados por lei à pessoa surda no Brasil.',
      link: 'https://www.youtube.com/watch?v=o_t1E4v-s1A'
    },
    {
      titulo: 'Libras em Contexto: Na Escola',
      descricao: 'Demonstra o uso da Libras no ambiente escolar.',
      link: 'https://www.youtube.com/watch?v=j2l4d5L7f1k'
    },
    {
      titulo: 'Libras em Contexto: No Trabalho',
      descricao: 'Mostra a aplicação da Libras no ambiente de trabalho.',
      link: 'https://www.youtube.com/watch?v=8L7_2p3V6fM'
    },
    {
      titulo: 'Libras em Contexto: Na Família',
      descricao: 'Exemplifica a comunicação em Libras no contexto familiar.',
      link: 'https://www.youtube.com/watch?v=l2f1p4a7Z8Y'
    },
    {
      titulo: 'Interpretação de Libras: Contação de Histórias',
      descricao: 'Demonstra a interpretação de histórias infantis em Libras.',
      link: 'https://www.youtube.com/watch?v=d12p9p5Q_1s'
    },
    {
      titulo: 'Alfabeto Datilológico e Números em Libras',
      descricao: 'Ensina o alfabeto datilológico e os números em Libras.',
      link: 'https://www.youtube.com/watch?v=Q09k8_yW-2U'
    },
    {
      titulo: 'Expressões Faciais na Libras',
      descricao: 'Explica a importância e o uso das expressões faciais na Libras.',
      link: 'https://www.youtube.com/watch?v=PfQ13f-wJ0s'
    },
    {
      titulo: 'Verbos em Libras',
      descricao: 'Introdução aos verbos na Libras.',
      link: 'https://www.youtube.com/watch?v=1p4_t9f5f7g'
    },
    {
      titulo: 'Advérbios em Libras',
      descricao: 'Apresenta alguns advérbios em Libras.',
      link: 'https://www.youtube.com/watch?v=fpWwQg0vdls'
    },
    {
      titulo: 'Pronomes em Libras',
      descricao: 'Ensina os pronomes pessoais e outros tipos de pronomes em Libras.',
      link: 'https://www.youtube.com/watch?v=aPNn1t3wW4M'
    },
    {
      titulo: 'Sentimentos em Libras',
      descricao: 'Vocabulário de sentimentos em Libras.',
      link: 'https://www.youtube.com/watch?v=s0b_F4_v-9o'
    },
    {
      titulo: 'Profissões em Libras',
      descricao: 'Vocabulário de profissões em Libras.',
      link: 'https://www.youtube.com/watch?v=l-R4lVwJ7_w'
    },
    {
      titulo: 'Libras para Crianças: Animais da Floresta',
      descricao: 'Ensina sinais de animais da floresta de forma lúdica para crianças.',
      link: 'https://www.youtube.com/watch?v=k1l4z5x6y_0'
    }
  ];

  res.render('cursos', { artigos, videos });
};


// Rota para a página de ajuda
exports.ajuda = (req, res) => {
  res.render('ajuda'); // Renderiza o arquivo ajuda.ejs
};
