// Glossário: lista as palavras que têm sinal cadastrado no banco (via /api/glossario),
// usando as categorias do glossario.json. Se a API estiver fora do ar, usa só o JSON.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:5000'
    : '';
  const ORDEM_CATEGORIAS = ['Alimentos', 'Animais', 'Educação', 'Saúde', 'Outros'];
  const LIMITE_RESULTADOS = 200;

  const container = document.getElementById('glossario-container');
  const resultados = document.getElementById('glossario-resultados');
  const busca = document.getElementById('glossario-busca');
  const status = document.getElementById('glossario-status');

  const normalizar = (texto) => texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  function criarTag(palavra) {
    const link = document.createElement('a');
    link.className = 'glossario-tag';
    link.textContent = palavra.label;
    link.href = `/home?word=${encodeURIComponent(palavra.label)}`;
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
