// Movimento compartilhado por todas as páginas (carregado pela navbar, com defer).
// Toda animação daqui respeita "Reduzir animações" (window.tlMovimentoReduzido, em includes/head.ejs):
// com movimento reduzido, o CSS zera as durações e tudo muda na hora.
(() => {
  'use strict';

  // ── Pílula deslizante nos seletores segmentados (.ciclo-seletor) ──
  // Ciclo de cobrança (Planos), tipo de conteúdo (Cursos) e velocidade do player (Tradutor).
  // Um único indicador desliza até a opção marcada, em vez de o laranja "pular" de uma para outra.
  // Os scripts de cada página continuam só trocando aria-checked/aria-pressed: a pílula observa isso.
  const OPCAO_ATIVA = '.ciclo-opcao[aria-checked="true"], .ciclo-opcao[aria-pressed="true"]';

  function posicionar(seletor, pilula) {
    const ativa = seletor.querySelector(OPCAO_ATIVA);
    if (!ativa || !ativa.offsetParent) {
      pilula.style.opacity = '0';
      return;
    }
    pilula.style.opacity = '1';
    pilula.style.width = `${ativa.offsetWidth}px`;
    pilula.style.height = `${ativa.offsetHeight}px`;
    pilula.style.transform = `translate(${ativa.offsetLeft}px, ${ativa.offsetTop}px)`;
  }

  function prepararPilula(seletor) {
    if (seletor.dataset.pilula) return;
    seletor.dataset.pilula = '1';

    const pilula = document.createElement('span');
    pilula.className = 'ciclo-pilula';
    pilula.setAttribute('aria-hidden', 'true');
    seletor.prepend(pilula);
    seletor.classList.add('com-pilula');

    // Primeira posição sem animação; só as trocas seguintes deslizam
    posicionar(seletor, pilula);
    requestAnimationFrame(() => requestAnimationFrame(() => pilula.classList.add('pronta')));

    new MutationObserver(() => posicionar(seletor, pilula))
      .observe(seletor, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'aria-pressed'] });
    // Tamanho da fonte, rotação do celular, opção que muda de largura...
    if ('ResizeObserver' in window) new ResizeObserver(() => posicionar(seletor, pilula)).observe(seletor);
  }

  document.querySelectorAll('.ciclo-seletor').forEach(prepararPilula);

  // Seletores criados depois (ex.: velocidade, em cada balão de tradução)
  new MutationObserver((mudancas) => {
    mudancas.forEach((mudanca) => mudanca.addedNodes.forEach((no) => {
      if (no.nodeType !== 1) return;
      if (no.matches('.ciclo-seletor')) prepararPilula(no);
      no.querySelectorAll('.ciclo-seletor').forEach(prepararPilula);
    }));
  }).observe(document.body, { childList: true, subtree: true });

  const reduzido = () => (window.tlMovimentoReduzido ? window.tlMovimentoReduzido() : false);
  const SAIDA = 'cubic-bezier(.2,.8,.2,1)';

  // ── 2.5 Filtros que reorganizam em vez de pular (técnica FLIP) ──
  // window.tlReorganizar(itens, mudar): mede onde cada item está, aplica a mudança (que só troca
  // "hidden") e anima a diferença. Quem fica desliza até o lugar novo, quem entra cresce e quem
  // sai encolhe e some (numa cópia, porque o original já está escondido). Usado em Cursos e Ajuda.
  window.tlReorganizar = function reorganizar(itens, mudar) {
    if (reduzido() || !document.body.animate) return mudar();
    const visivel = (el) => el.getClientRects().length > 0;
    const antes = new Map();
    itens.forEach((el) => { if (visivel(el)) antes.set(el, el.getBoundingClientRect()); });
    const resultado = mudar();
    itens.forEach((el, i) => {
      const inicio = antes.get(el);
      if (visivel(el)) {
        const fim = el.getBoundingClientRect();
        if (!inicio) {
          el.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }],
            { duration: 260, delay: Math.min(i, 8) * 18, easing: SAIDA, fill: 'backwards' });
        } else if (Math.abs(inicio.left - fim.left) + Math.abs(inicio.top - fim.top) > 1) {
          el.animate([{ transform: `translate(${inicio.left - fim.left}px, ${inicio.top - fim.top}px)` }, { transform: 'none' }],
            { duration: 340, easing: SAIDA });
        }
      } else if (inicio && inicio.bottom > 0 && inicio.top < window.innerHeight) {
        // Saindo (só os que estavam na tela): uma cópia parada no lugar antigo encolhe e some
        const copia = el.cloneNode(true);
        copia.removeAttribute('id');
        copia.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
        copia.hidden = false;
        copia.setAttribute('aria-hidden', 'true');
        copia.inert = true;
        Object.assign(copia.style, {
          position: 'fixed', left: `${inicio.left}px`, top: `${inicio.top}px`, width: `${inicio.width}px`,
          height: `${inicio.height}px`, margin: '0', pointerEvents: 'none', zIndex: '5', boxSizing: 'border-box',
        });
        document.body.append(copia);
        copia.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.9)' }],
          { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(() => copia.remove(), () => copia.remove());
      }
    });
    return resultado;
  };

  // ── 2.4 A palavra viaja até a tradução ──
  // Links "/home?word=..." (Glossário, Histórico): a palavra clicada ganha o nome "texto-enviado" e,
  // na transição entre páginas, voa até o balão da conversa no Tradutor (que tem o mesmo nome).
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('a[href^="/home?word="]');
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    document.querySelectorAll('[style*="view-transition-name"]').forEach((el) => { el.style.viewTransitionName = ''; });
    const origem = link.closest('.historico-item')?.querySelector('.historico-texto') || link;
    origem.style.viewTransitionName = 'texto-enviado';
  });
  // Voltando pelo histórico do navegador, a página pode vir do cache com o nome ainda aplicado
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('.glossario-tag, .historico-texto').forEach((el) => { el.style.viewTransitionName = ''; });
  });

  // ── 2.3 Menu em camadas ──
  // Itens entram em cascata (CSS usa --i), a página ao fundo recua, e um indicador desliza até o
  // item sob o mouse/foco e volta para a página atual quando o mouse sai.
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    [...sidebar.querySelectorAll('.sidebar-header, .nav-link, .nav-linha')].forEach((el, i) => el.style.setProperty('--i', i));
    const indicador = document.createElement('span');
    indicador.className = 'nav-indicador';
    indicador.setAttribute('aria-hidden', 'true');
    sidebar.prepend(indicador);
    sidebar.classList.add('com-indicador');
    const links = [...sidebar.querySelectorAll('.nav-link')];
    const ativo = () => sidebar.querySelector('.nav-link.active');
    const mover = (alvo) => {
      if (!alvo) { indicador.style.opacity = '0'; return; }
      indicador.style.opacity = '1';
      indicador.style.height = `${alvo.offsetHeight}px`;
      indicador.style.transform = `translateY(${alvo.getBoundingClientRect().top - sidebar.getBoundingClientRect().top}px)`;
    };
    links.forEach((link) => {
      link.addEventListener('pointerenter', () => mover(link));
      link.addEventListener('focus', () => mover(link));
    });
    sidebar.addEventListener('pointerleave', () => mover(ativo()));
    sidebar.addEventListener('focusout', (e) => { if (!sidebar.contains(e.relatedTarget)) mover(ativo()); });
    // Posição inicial (sem deslizar) quando o menu abre; depois, as trocas deslizam
    new MutationObserver(() => {
      if (!sidebar.classList.contains('open')) return;
      indicador.classList.remove('pronto');
      mover(ativo()); // já no lugar ao abrir (a abertura só mexe no eixo X, a altura dos itens não muda)
      requestAnimationFrame(() => requestAnimationFrame(() => indicador.classList.add('pronto')));
    }).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    // A página ao fundo recua enquanto o menu está aberto
    new MutationObserver(() => document.body.classList.toggle('menu-aberto', sidebar.classList.contains('open')))
      .observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  }

  // ── 3.3 Planos com inclinação e mola ──
  // O cartão inclina (até 6°) seguindo o cursor, com um brilho que acompanha; ao sair, volta com mola.
  // Só com mouse (nunca no toque) e nunca com movimento reduzido.
  const ponteiroFino = window.matchMedia('(hover: hover) and (pointer: fine)');
  document.querySelectorAll('.plano-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      if (!ponteiroFino.matches || reduzido()) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.classList.add('inclinando');
      card.style.setProperty('--ry', `${((x - 0.5) * 12).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(2)}deg`);
      card.style.setProperty('--brilho-x', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--brilho-y', `${(y * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('inclinando');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
})();
