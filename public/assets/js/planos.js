// Página de planos: seletor de ciclo de cobrança e contato comercial (mailto + copiar e-mail)
(() => {
  'use strict';

  const seletor = document.getElementById('cicloSeletor');
  if (!seletor) return;

  const opcoes = [...seletor.querySelectorAll('.ciclo-opcao')];
  const anuncioCiclo = document.getElementById('cicloAnuncio');
  // Escolha de "Reduzir animações" do site ou, sem ela, a do sistema (includes/head.ejs)
  const reduzirMovimento = window.tlMovimentoReduzido
    ? window.tlMovimentoReduzido()
    : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cicloAtual = (opcoes.find((o) => o.getAttribute('aria-checked') === 'true') || opcoes[0]).dataset.ciclo;
  let origemContato = null; // botão que levou ao contato (para atualizar o assunto se o ciclo mudar)

  const rotuloDoCiclo = (id) => opcoes.find((o) => o.dataset.ciclo === id).querySelector('.ciclo-rotulo').textContent.trim();

  // ── Seletor de ciclo ──────────────────────────────────────
  function selecionarCiclo(opcao, focar = false) {
    cicloAtual = opcao.dataset.ciclo;
    opcoes.forEach((o) => {
      const ativo = o === opcao;
      o.setAttribute('aria-checked', String(ativo));
      o.tabIndex = ativo ? 0 : -1;
    });
    document.querySelectorAll('.plano-preco').forEach((preco) => {
      preco.hidden = preco.dataset.ciclo !== cicloAtual;
    });
    // Os cartões "respiram" com a troca (CSS .respirar; zerado com animações reduzidas)
    document.querySelectorAll('.plano-card').forEach((card) => {
      card.classList.remove('respirar');
      void card.offsetWidth; // reinicia a animação
      card.classList.add('respirar');
    });
    if (focar) opcao.focus();

    const destaque = document.querySelector('.plano-destaque .plano-preco:not([hidden])');
    const valor = destaque ? destaque.querySelector('.plano-preco-valor').textContent.trim() : '';
    const periodo = destaque ? (destaque.querySelector('.plano-preco-periodo')?.textContent.trim() || '') : '';
    anuncioCiclo.textContent = `Cobrança ${rotuloDoCiclo(cicloAtual).toLowerCase()} selecionada.${valor ? ` Enterprise: ${valor} ${periodo}.` : ''}`;

    if (origemContato && 'comCiclo' in origemContato.dataset) definirAssunto(assuntoDe(origemContato));
  }

  opcoes.forEach((opcao, i) => {
    opcao.addEventListener('click', () => selecionarCiclo(opcao));
    // Setas do teclado navegam entre as opções (padrão de radiogroup)
    opcao.addEventListener('keydown', (e) => {
      const passo = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      let destino = null;
      if (passo) destino = opcoes[(i + passo + opcoes.length) % opcoes.length];
      if (e.key === 'Home') destino = opcoes[0];
      if (e.key === 'End') destino = opcoes[opcoes.length - 1];
      if (destino) {
        e.preventDefault();
        selecionarCiclo(destino, true);
      }
    });
  });

  // ── Contato comercial ─────────────────────────────────────
  const botaoCopiar = document.getElementById('emailCopiar');
  const EMAIL = botaoCopiar.dataset.email;
  const linkEmail = document.getElementById('emailLink');
  const botaoEnviar = document.getElementById('emailEnviar');
  const textoAssunto = document.getElementById('contatoAssunto');
  const secaoContato = document.getElementById('contato');
  const anuncioCopia = document.getElementById('copiaAnuncio');

  function assuntoDe(botao) {
    return botao.dataset.assunto + ('comCiclo' in botao.dataset ? ` – ${rotuloDoCiclo(cicloAtual)}` : '');
  }

  function definirAssunto(assunto) {
    const corpo = `Olá, equipe TraduLibras!\n\nTenho interesse em: ${assunto}.\n\nNome:\nOrganização:\nTelefone (opcional):\n`;
    const href = `mailto:${EMAIL}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    botaoEnviar.href = href;
    linkEmail.href = href;
    textoAssunto.textContent = `Assunto: ${assunto}`;
  }

  // Todos os botões de contratação levam ao mesmo bloco de contato, com o assunto já definido
  document.querySelectorAll('.js-contato').forEach((botao) => {
    botao.addEventListener('click', (e) => {
      e.preventDefault();
      origemContato = botao;
      definirAssunto(assuntoDe(botao));
      secaoContato.scrollIntoView({ behavior: reduzirMovimento ? 'auto' : 'smooth', block: 'center' });
      secaoContato.focus({ preventScroll: true });
      secaoContato.classList.remove('planos-contato-realce');
      void secaoContato.offsetWidth; // reinicia a animação
      secaoContato.classList.add('planos-contato-realce');
    });
  });

  // ── Copiar e-mail ─────────────────────────────────────────
  const textoOriginalCopiar = botaoCopiar.textContent;
  let timerCopia = null;

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      // Navegadores sem a Clipboard API (ou página fora de HTTPS)
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.append(campo);
      campo.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      campo.remove();
      return ok;
    }
  }

  botaoCopiar.addEventListener('click', async () => {
    const ok = await copiarTexto(EMAIL);
    clearTimeout(timerCopia);
    if (ok) {
      botaoCopiar.textContent = '✓ Copiado!';
      botaoCopiar.classList.add('copiado');
      anuncioCopia.textContent = 'E-mail copiado para a área de transferência.';
    } else {
      // Não deu para copiar: seleciona o e-mail para o usuário copiar com Ctrl+C
      const selecao = window.getSelection();
      const intervalo = document.createRange();
      intervalo.selectNodeContents(linkEmail);
      selecao.removeAllRanges();
      selecao.addRange(intervalo);
      botaoCopiar.textContent = 'Use Ctrl+C para copiar';
      anuncioCopia.textContent = 'Não foi possível copiar automaticamente. O e-mail foi selecionado.';
    }
    timerCopia = setTimeout(() => {
      botaoCopiar.textContent = textoOriginalCopiar;
      botaoCopiar.classList.remove('copiado');
    }, 2000);
  });
})();
