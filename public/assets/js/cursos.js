// Página Cursos: busca, filtros por tipo e tema, player em janela e marcação de "visto".
(() => {
  'use strict';

  const busca = document.getElementById('cursosBusca');
  const status = document.getElementById('cursosStatus');
  const destaque = document.getElementById('cursosDestaque');
  const secoes = { video: document.getElementById('secaoVideos'), artigo: document.getElementById('secaoArtigos') };
  const vazio = document.getElementById('cursosVazio');
  const botoesTipo = [...document.querySelectorAll('.cursos-tipo .ciclo-opcao')];
  const chipsTema = [...document.querySelectorAll('.curso-chip')];
  const cards = [...document.querySelectorAll('.js-lista .curso-card')];

  const estado = { tipo: 'todos', tema: 'todos', texto: '' };

  // Busca sem diferenciar acentos ("familia" encontra "família")
  const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  cards.forEach((card) => { card.dataset.buscaNorm = semAcento(card.dataset.busca || ''); });

  // Os cartões que ficam deslizam até o lugar novo, em vez de pular (movimento.js: tlReorganizar)
  function aplicar() {
    const mudar = () => aplicarFiltros();
    return window.tlReorganizar ? window.tlReorganizar([destaque, ...cards], mudar) : mudar();
  }

  function aplicarFiltros() {
    const termo = semAcento(estado.texto.trim());
    const filtrando = Boolean(estado.tipo !== 'todos' || estado.tema !== 'todos' || termo);
    const contagem = { video: 0, artigo: 0 };
    const naLista = { video: 0, artigo: 0 };

    cards.forEach((card) => {
      const confere = (estado.tipo === 'todos' || card.dataset.tipo === estado.tipo)
        && (estado.tema === 'todos' || card.dataset.tema === estado.tema)
        && (!termo || card.dataset.buscaNorm.includes(termo));
      // Sem filtro, os destaques já aparecem em "Comece por aqui": não repete na lista
      const visivel = confere && (filtrando || !('destaque' in card.dataset));
      card.hidden = !visivel;
      if (confere) contagem[card.dataset.tipo] += 1;
      if (visivel) naLista[card.dataset.tipo] += 1;
    });

    Object.entries(secoes).forEach(([tipo, secao]) => { secao.hidden = naLista[tipo] === 0; });
    destaque.hidden = filtrando;

    const total = contagem.video + contagem.artigo;
    vazio.hidden = total > 0;
    const partes = [];
    if (contagem.video) partes.push(`${contagem.video} ${contagem.video === 1 ? 'vídeo' : 'vídeos'}`);
    if (contagem.artigo) partes.push(`${contagem.artigo} ${contagem.artigo === 1 ? 'artigo' : 'artigos'}`);
    status.textContent = total === 0 ? 'Nenhum resultado.' : `Mostrando ${partes.join(' e ')}.`;
  }

  // Tipo (Tudo / Vídeos / Artigos), com navegação por setas como um grupo de rádio
  function escolherTipo(botao, focar) {
    botoesTipo.forEach((b) => {
      const ativo = b === botao;
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    });
    if (focar) botao.focus();
    estado.tipo = botao.dataset.tipo;
    aplicar();
  }
  botoesTipo.forEach((botao, i) => {
    botao.addEventListener('click', () => escolherTipo(botao));
    botao.addEventListener('keydown', (e) => {
      const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!passo) return;
      e.preventDefault();
      escolherTipo(botoesTipo[(i + passo + botoesTipo.length) % botoesTipo.length], true);
    });
  });

  // Tema
  function escolherTema(tema) {
    chipsTema.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.tema === tema)));
    estado.tema = tema;
    aplicar();
  }
  chipsTema.forEach((chip) => chip.addEventListener('click', () => {
    escolherTema(chip.getAttribute('aria-pressed') === 'true' && chip.dataset.tema !== 'todos' ? 'todos' : chip.dataset.tema);
  }));

  // Busca
  let espera;
  busca.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.texto = busca.value; aplicar(); }, 120);
  });

  document.getElementById('cursosLimpar').addEventListener('click', () => {
    busca.value = '';
    estado.texto = '';
    escolherTipo(botoesTipo[0]);
    escolherTema('todos');
    busca.focus();
  });

  // ── Vídeos já vistos (fica só neste navegador) ────────────
  const CHAVE_VISTOS = 'tradulibras:cursosVistos';
  let vistos = new Set();
  try { vistos = new Set(JSON.parse(localStorage.getItem(CHAVE_VISTOS) || '[]')); } catch (e) { /* armazenamento indisponível */ }

  // Barra "X de N vídeos vistos": enche com mola quando um vídeo novo é concluído (CSS --feito)
  const progresso = document.getElementById('cursosProgresso');
  const progressoTexto = document.getElementById('cursosProgressoTexto');
  const progressoBarra = progresso ? progresso.querySelector('[role="progressbar"]') : null;
  const idsVideos = [...new Set([...document.querySelectorAll('.js-video')].map((l) => l.dataset.video))];

  function atualizarProgresso() {
    if (!progresso) return;
    const vistosAqui = idsVideos.filter((id) => vistos.has(id)).length;
    progresso.hidden = false;
    progressoTexto.textContent = `${vistosAqui} de ${idsVideos.length} ${idsVideos.length === 1 ? 'vídeo visto' : 'vídeos vistos'}`;
    progressoBarra.setAttribute('aria-valuenow', String(vistosAqui));
    progressoBarra.style.setProperty('--feito', idsVideos.length ? (vistosAqui / idsVideos.length).toFixed(4) : '0');
  }

  let recemVisto = null; // o selo "✓ Visto" desse vídeo "pula" quando a janela do vídeo fecha

  function marcarVistos() {
    document.querySelectorAll('.js-video').forEach((link) => {
      const selo = link.querySelector('.curso-visto');
      if (!selo) return;
      selo.hidden = !vistos.has(link.dataset.video);
      if (link.dataset.video === recemVisto && !selo.hidden) {
        selo.classList.remove('recem');
        void selo.offsetWidth; // reinicia a animação
        selo.classList.add('recem');
      }
    });
    recemVisto = null;
    atualizarProgresso();
  }
  function registrarVisto(id) {
    if (!vistos.has(id)) recemVisto = id;
    vistos.add(id);
    try { localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...vistos])); } catch (e) { /* armazenamento indisponível */ }
    // O selo e a barra só mudam quando a janela do vídeo fecha, para a pessoa ver acontecer
  }

  // ── Player em janela (sem sair do site) ───────────────────
  const player = document.getElementById('cursoPlayer');
  const area = document.getElementById('cursoPlayerArea');
  const titulo = document.getElementById('cursoPlayerTitulo');
  const linkYoutube = document.getElementById('cursoPlayerYoutube');
  const fechar = document.getElementById('cursoPlayerFechar');
  let origemFoco = null;

  function abrirVideo(link) {
    const id = link.dataset.video;
    if (!/^[\w-]{11}$/.test(id)) return;
    origemFoco = link;
    titulo.textContent = link.dataset.titulo || 'Vídeo';
    linkYoutube.href = link.href;

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    iframe.title = link.dataset.titulo || 'Vídeo do YouTube';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    area.replaceChildren(iframe);

    player.classList.add('open');
    document.body.style.overflow = 'hidden';
    fechar.focus();
    registrarVisto(id);
  }

  function fecharVideo() {
    if (!player.classList.contains('open')) return;
    player.classList.remove('open');
    area.replaceChildren(); // remove o iframe e para o vídeo
    document.body.style.overflow = '';
    if (origemFoco) origemFoco.focus();
    marcarVistos();
  }

  document.querySelectorAll('.js-video').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // abrir em nova aba continua funcionando
      e.preventDefault();
      abrirVideo(link);
    });
  });
  fechar.addEventListener('click', fecharVideo);
  player.addEventListener('click', (e) => { if (e.target === player) fecharVideo(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharVideo(); });

  marcarVistos();
  aplicar();
})();
