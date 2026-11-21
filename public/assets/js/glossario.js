// Glossário: lista as palavras que têm sinal cadastrado no banco (via /api/glossario),
// usando as categorias do glossario.json. Se a API estiver fora do ar, usa só o JSON.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:5000'
    : '';
  // Mesma ordem de scripts/gerar_glossario.py (que gera as categorias do glossario.json)
  const ORDEM_CATEGORIAS = [
    'Alimentos e bebidas', 'Animais', 'Natureza', 'Corpo e saúde',
    'Pessoas, família e profissões', 'Sentimentos e emoções', 'Lugares', 'Objetos',
    'Tempo e datas', 'Comunicação e linguagem', 'Educação e conhecimento',
    'Sociedade, trabalho e dinheiro', 'Números e quantidades', 'Alfabeto',
    'Ações (verbos)', 'Qualidades (adjetivos)', 'Expressões', 'Outros',
  ];
  const LIMITE_RESULTADOS = 200;

  const container = document.getElementById('glossario-container');
  const resultados = document.getElementById('glossario-resultados');
  const busca = document.getElementById('glossario-busca');
  const status = document.getElementById('glossario-status');

  const normalizar = (texto) => texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[_\s]+/g, ' ').trim();

  // Padroniza a exibição: só a primeira letra maiúscula ("ABOCANHAR" -> "Abocanhar"),
  // mantendo letras do alfabeto ("letra b" -> "Letra B") e "Libras" em maiúscula.
  // O link continua usando o texto original do banco.
  function formatarRotulo(label) {
    const texto = label.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
    if (/^\p{L}$/u.test(texto)) return texto.toLocaleUpperCase('pt-BR');
    const palavras = texto.split(' ').map((p, i, todas) => {
      if (p === 'libras') return 'Libras';
      const anterior = todas[i - 1];
      if (p.length === 1 && /^(letra|lestra)$/.test(anterior || '')) return p.toLocaleUpperCase('pt-BR');
      return p;
    });
    const frase = palavras.join(' ');
    return frase.charAt(0).toLocaleUpperCase('pt-BR') + frase.slice(1);
  }

  function criarTag(palavra) {
    const link = document.createElement('a');
    link.className = 'glossario-tag';
    link.textContent = formatarRotulo(palavra.label);
    link.href = `/home?word=${encodeURIComponent(palavra.label)}`;
    link.dataset.rotulo = palavra.label; // texto original do banco, usado na prévia do sinal
    return link;
  }

  async function buscarJson(url) {
    const resposta = await fetch(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta.json();
  }

  async function carregarPalavras() {
    const [json, api] = await Promise.allSettled([
      buscarJson('/data/glossario.json'),
      buscarJson(`${API_BASE}/api/glossario`),
    ]);

    const categoriaPorPalavra = new Map();
    if (json.status === 'fulfilled') {
      json.value.forEach((item) => {
        categoriaPorPalavra.set(normalizar(item.label), item.categoria || 'Outros');
      });
    }

    if (api.status === 'fulfilled' && Array.isArray(api.value.palavras)) {
      return api.value.palavras.map((label) => ({
        label,
        chave: normalizar(label),
        categoria: categoriaPorPalavra.get(normalizar(label)) || 'Outros',
      }));
    }
    if (json.status === 'fulfilled') {
      console.warn('API do glossário indisponível; usando apenas o glossario.json');
      return json.value.map((item) => ({
        label: item.label,
        chave: normalizar(item.label),
        categoria: item.categoria || 'Outros',
      }));
    }
    throw new Error('Glossário indisponível');
  }

  // Categorias começam fechadas; as palavras só são criadas quando a categoria é aberta
  function renderCategorias(palavras) {
    const porCategoria = new Map();
    palavras.forEach((p) => {
      const categoria = ORDEM_CATEGORIAS.includes(p.categoria) ? p.categoria : 'Outros';
      if (!porCategoria.has(categoria)) porCategoria.set(categoria, []);
      porCategoria.get(categoria).push(p);
    });

    ORDEM_CATEGORIAS.forEach((categoria, indice) => {
      const itens = porCategoria.get(categoria);
      if (!itens || itens.length === 0) return;

      const idGrupo = `glossario-grupo-${indice}`;
      const cabecalho = document.createElement('button');
      cabecalho.type = 'button';
      cabecalho.className = 'glossario-categoria-titulo';
      cabecalho.setAttribute('aria-expanded', 'false');
      cabecalho.setAttribute('aria-controls', idGrupo);

      const seta = document.createElement('span');
      seta.className = 'glossario-seta';
      seta.setAttribute('aria-hidden', 'true');
      seta.textContent = '›';
      const nome = document.createElement('span');
      nome.textContent = categoria;
      const contagem = document.createElement('span');
      contagem.className = 'glossario-contagem';
      contagem.textContent = `${itens.length} ${itens.length === 1 ? 'palavra' : 'palavras'}`;
      cabecalho.append(seta, nome, contagem);

      const grupo = document.createElement('div');
      grupo.className = 'glossario-grupo';
      grupo.id = idGrupo;
      grupo.hidden = true;

      cabecalho.addEventListener('click', () => {
        const abrir = grupo.hidden;
        if (abrir && grupo.childElementCount === 0) {
          const fragmento = document.createDocumentFragment();
          itens.forEach((p) => fragmento.append(criarTag(p)));
          grupo.append(fragmento);
        }
        grupo.hidden = !abrir;
        cabecalho.classList.toggle('aberto', abrir);
        cabecalho.setAttribute('aria-expanded', String(abrir));
      });

      container.append(cabecalho, grupo);
    });
  }

  function configurarBusca(palavras) {
    let timer = null;
    busca.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const termo = normalizar(busca.value);
        if (!termo) {
          resultados.hidden = true;
          resultados.replaceChildren();
          container.hidden = false;
          status.textContent = `${palavras.length} palavras disponíveis.`;
          return;
        }

        const encontradas = palavras.filter((p) => p.chave.includes(termo));
        // Primeiro as que começam com o termo buscado
        encontradas.sort((a, b) => (b.chave.startsWith(termo) - a.chave.startsWith(termo)) || a.chave.localeCompare(b.chave));

        const fragmento = document.createDocumentFragment();
        encontradas.slice(0, LIMITE_RESULTADOS).forEach((p) => fragmento.append(criarTag(p)));
        resultados.replaceChildren(fragmento);
        resultados.hidden = encontradas.length === 0;
        container.hidden = true;

        if (encontradas.length === 0) status.textContent = 'Nenhuma palavra encontrada.';
        else if (encontradas.length > LIMITE_RESULTADOS) status.textContent = `Mostrando ${LIMITE_RESULTADOS} de ${encontradas.length} resultados. Refine a busca.`;
        else status.textContent = `${encontradas.length} ${encontradas.length === 1 ? 'resultado' : 'resultados'}.`;
      }, 150);
    });
  }

  // ── Prévia do sinal: "carta que vira" ─────────────────────
  // Parar o mouse sobre uma palavra (ou focar e apertar Espaço) mostra o vídeo do sinal sem sair da
  // página; Esc fecha; Enter/clique continuam levando ao tradutor. O vídeo só é buscado quando
  // pedido (são mais de 4 mil palavras) e fica guardado. A carta é só visual (aria-hidden): o link
  // já leva à tradução completa. Com animações reduzidas, aparece sem girar.
  const ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const reduzido = () => (window.tlMovimentoReduzido ? window.tlMovimentoReduzido() : false);
  const urlsDoSinal = new Map();

  const carta = document.createElement('div');
  carta.className = 'glossario-carta';
  carta.hidden = true;
  carta.setAttribute('aria-hidden', 'true');
  const face = document.createElement('div');
  face.className = 'glossario-carta-face';
  const videoCarta = document.createElement('video');
  videoCarta.muted = true;
  videoCarta.loop = true;
  videoCarta.playsInline = true;
  const rotuloCarta = document.createElement('p');
  rotuloCarta.className = 'glossario-carta-rotulo';
  const estadoCarta = document.createElement('p');
  estadoCarta.className = 'glossario-carta-estado';
  face.append(videoCarta, rotuloCarta, estadoCarta);
  carta.append(face);
  document.body.append(carta);

  let tagAtual = null;
  let timerMostrar = null;
  let timerEsconder = null;

  function urlDoSinal(rotulo) {
    if (!urlsDoSinal.has(rotulo)) {
      urlsDoSinal.set(rotulo, fetch('/traduzir', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ texto: rotulo, exclusoes: [] }),
      }).then((r) => (r.ok ? r.json() : null))
        .then((dados) => dados?.sequencia?.[0]?.url || null)
        .catch(() => null));
    }
    return urlsDoSinal.get(rotulo);
  }

  function posicionar(tag) {
    const r = tag.getBoundingClientRect();
    const largura = 220;
    const altura = carta.offsetHeight || 230;
    const esquerda = Math.min(Math.max(8, r.left + r.width / 2 - largura / 2), window.innerWidth - largura - 8);
    const cabeEmbaixo = r.bottom + 10 + altura < window.innerHeight;
    carta.style.left = `${esquerda}px`;
    carta.style.top = `${cabeEmbaixo ? r.bottom + 10 : Math.max(8, r.top - altura - 10)}px`;
    carta.classList.toggle('acima', !cabeEmbaixo);
  }

  async function mostrarCarta(tag) {
    clearTimeout(timerEsconder);
    if (tagAtual === tag && !carta.hidden) return;
    tagAtual = tag;
    const rotulo = tag.dataset.rotulo || tag.textContent;
    rotuloCarta.textContent = tag.textContent;
    estadoCarta.textContent = 'Carregando o sinal…';
    estadoCarta.hidden = false;
    videoCarta.removeAttribute('src');
    carta.hidden = false;
    posicionar(tag);
    carta.classList.remove('virando');
    if (!reduzido()) { void carta.offsetWidth; carta.classList.add('virando'); }

    const url = await urlDoSinal(rotulo);
    if (tagAtual !== tag || carta.hidden) return;
    if (!url) { estadoCarta.textContent = 'Não foi possível carregar o sinal.'; return; }
    estadoCarta.hidden = true;
    videoCarta.src = url;
    videoCarta.play().catch(() => {});
    posicionar(tag);
  }

  function esconderCarta() {
    clearTimeout(timerMostrar);
    tagAtual = null;
    carta.hidden = true;
    carta.classList.remove('virando');
    videoCarta.pause();
    videoCarta.removeAttribute('src');
    videoCarta.load(); // para o download
  }

  const tagDe = (alvo) => (alvo && alvo.closest ? alvo.closest('.glossario-tag') : null);
  [container, resultados].forEach((area) => {
    area.addEventListener('pointerover', (e) => {
      const tag = tagDe(e.target);
      if (!tag || !ponteiroFino.matches) return;
      clearTimeout(timerMostrar);
      clearTimeout(timerEsconder);
      timerMostrar = setTimeout(() => mostrarCarta(tag), 350); // só quando o mouse "para" na palavra
    });
    area.addEventListener('pointerout', (e) => {
      if (!tagDe(e.target) || carta.contains(e.relatedTarget)) return;
      clearTimeout(timerMostrar);
      timerEsconder = setTimeout(esconderCarta, 180);
    });
    area.addEventListener('keydown', (e) => {
      const tag = tagDe(e.target);
      if (!tag) return;
      if (e.key === ' ') { e.preventDefault(); if (carta.hidden || tagAtual !== tag) mostrarCarta(tag); else esconderCarta(); }
      if (e.key === 'Escape') esconderCarta();
    });
    area.addEventListener('focusout', (e) => { if (tagDe(e.target)) esconderCarta(); });
  });
  carta.addEventListener('pointerenter', () => clearTimeout(timerEsconder));
  carta.addEventListener('pointerleave', () => { timerEsconder = setTimeout(esconderCarta, 180); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !carta.hidden) esconderCarta(); });
  window.addEventListener('scroll', () => { if (!carta.hidden) esconderCarta(); }, true);

  carregarPalavras()
    .then((palavras) => {
      renderCategorias(palavras);
      configurarBusca(palavras);
      status.textContent = `${palavras.length} palavras disponíveis.`;
    })
    .catch((erro) => {
      console.error('Erro ao carregar glossário:', erro);
      status.textContent = 'Não foi possível carregar o glossário agora. Tente novamente em instantes.';
      busca.disabled = true;
    });
})();
