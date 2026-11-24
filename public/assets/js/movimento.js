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

  // ── 4.1 Cabeçalho: ganha borda e sombra quando a página rola ──
  const topo = document.getElementById('topoSite');
  if (topo) {
    let agendado = false;
    const atualizarTopo = () => { agendado = false; topo.classList.toggle('rolou', window.scrollY > 8); };
    window.addEventListener('scroll', () => {
      if (!agendado) { agendado = true; requestAnimationFrame(atualizarTopo); }
    }, { passive: true });
    atualizarTopo();
  }

  // ── 4.2 "Pular para o conteúdo" leva ao conteúdo principal da página ──
  const pular = document.querySelector('.pular-conteudo');
  const principal = document.querySelector('main:not([hidden]), body.page-centered > .container');
  if (pular && principal) {
    if (!principal.id) principal.id = 'conteudo';
    pular.setAttribute('href', `#${principal.id}`);
    if (!principal.hasAttribute('tabindex')) principal.setAttribute('tabindex', '-1');
  }

  // ── 4.3 Entrada ao rolar ──
  // O que está abaixo da dobra sobe e aparece ao chegar na tela; o que entra junto vem em cascata.
  // O que já está visível ao abrir a página não é escondido (nada pisca). Movimento reduzido: nada muda.
  const REVELAR = [
    '.home-secao .secao-titulo', '.passo', '.explorar-card',
    '.plano-card', '.planos-tokens', '.planos-ong', '.planos-contato',
    '.sobre-secao-titulo', '.sobre-cartao', '.sobre-recurso', '.dev-card', '.sobre-cta',
    '.ajuda-item', '.curso-card',
    '.rodape-marca', '.rodape-coluna',
  ].join(', ');
  if (!reduzido() && 'IntersectionObserver' in window) {
    const limpar = (el) => { el.classList.remove('revelar', 'revelado'); el.style.removeProperty('--ordem'); };
    const observador = new IntersectionObserver((entradas) => {
      const chegando = entradas.filter((e) => e.isIntersecting).map((e) => e.target);
      // Cascata pela posição na tela: de cima para baixo, da esquerda para a direita
      chegando.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return Math.abs(ra.top - rb.top) > 8 ? ra.top - rb.top : ra.left - rb.left;
      });
      chegando.forEach((el, i) => {
        observador.unobserve(el);
        el.style.setProperty('--ordem', String(Math.min(i, 6)));
        el.classList.add('revelado');
        // Terminada a entrada, o elemento volta às transições dele (hover etc.)
        el.addEventListener('transitionend', function fim(e) {
          if (e.target !== el || e.propertyName !== 'opacity') return;
          el.removeEventListener('transitionend', fim);
          limpar(el);
        });
        setTimeout(() => limpar(el), 700 + Math.min(i, 6) * 90 + 400);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });

    const dobra = window.innerHeight * 0.94;
    document.querySelectorAll(REVELAR).forEach((el) => {
      const caixa = el.getBoundingClientRect();
      if (!caixa.height || caixa.top < dobra) return; // escondido ou já visível
      el.classList.add('revelar');
      observador.observe(el);
    });
  }

  // ── 4.4 Números que contam até o valor (tela inicial) ──
  const contadores = document.querySelectorAll('[data-contar]');
  if (contadores.length && !reduzido() && 'IntersectionObserver' in window) {
    const formatar = new Intl.NumberFormat('pt-BR');
    const contar = (el) => {
      const fim = Number(el.dataset.contar);
      if (!Number.isFinite(fim) || fim <= 0) return;
      // Largura do valor final reservada: o "+" ao lado não fica dançando
      el.style.display = 'inline-block';
      el.style.minWidth = `${el.getBoundingClientRect().width}px`;
      const inicio = performance.now();
      const DURACAO = 1400;
      const quadro = (agora) => {
        const t = Math.min(1, (agora - inicio) / DURACAO);
        el.textContent = formatar.format(Math.round(fim * (1 - (1 - t) ** 3)));
        if (t < 1) requestAnimationFrame(quadro);
      };
      requestAnimationFrame(quadro);
    };
    const observarNumeros = new IntersectionObserver((entradas) => entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      observarNumeros.unobserve(e.target);
      contar(e.target);
    }), { threshold: 0.6 });
    contadores.forEach((el) => observarNumeros.observe(el));
  }

  // ── 4.5 Mostrar/ocultar senha (entrar, criar conta, nova senha) ──
  const OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OLHO_RISCADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  document.querySelectorAll('.page-centered input[type="password"]').forEach((campo) => {
    const caixa = document.createElement('div');
    caixa.className = 'campo-senha';
    campo.before(caixa);
    caixa.append(campo);
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'mostrar-senha';
    botao.setAttribute('aria-label', 'Mostrar senha');
    botao.setAttribute('aria-pressed', 'false');
    botao.innerHTML = OLHO;
    botao.addEventListener('click', () => {
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      botao.setAttribute('aria-pressed', String(mostrar));
      botao.innerHTML = mostrar ? OLHO_RISCADO : OLHO;
      campo.focus();
    });
    caixa.append(botao);
  });
})();
