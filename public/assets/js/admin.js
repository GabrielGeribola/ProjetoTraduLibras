// Área de administração: confirmações, seleção em lote, prévia de vídeo e pequenos atalhos.
(() => {
  'use strict';

  // ── Confirmação antes de ações destrutivas ou em massa ────
  // data-confirmar no <form> ou no botão que envia.
  document.addEventListener('submit', (e) => {
    const form = e.target;
    const botao = e.submitter;
    const mensagem = (botao && botao.dataset.confirmar) || form.dataset.confirmar;
    if (mensagem && !window.confirm(mensagem)) {
      e.preventDefault();
      return;
    }
    // Evita envio duplo (varredura do S3 e aprovação em massa demoram)
    if (botao && botao.dataset.aguarde) {
      const texto = botao.dataset.aguarde;
      // Desativa depois do envio começar (o valor do botão já foi incluído no formulário)
      setTimeout(() => {
        botao.disabled = true;
        botao.textContent = texto;
      }, 0);
    }
  });

  // ── Enter num campo da lista do S3 não envia (não aprova nada sem querer) ──
  document.querySelectorAll('form[data-sem-enter]').forEach((form) => {
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') e.preventDefault();
    });
  });

  // ── Filtros que se aplicam ao mudar ───────────────────────
  document.querySelectorAll('select[data-auto-enviar]').forEach((select) => {
    select.addEventListener('change', () => select.form && select.form.submit());
  });

  // ── Seleção em lote (lista do S3) ─────────────────────────
  document.querySelectorAll('form').forEach((form) => {
    const todos = form.querySelector('[data-marcar-todos]');
    const caixas = [...form.querySelectorAll('input[type="checkbox"][name="ids"]')];
    const barra = form.querySelector('[data-barra-lote]');
    const contador = form.querySelector('[data-contador-selecionados]');
    if (!caixas.length) return;

    const atualizar = () => {
      const marcados = caixas.filter((c) => c.checked).length;
      if (contador) contador.textContent = marcados;
      if (barra) barra.hidden = marcados === 0;
      if (todos) {
        todos.checked = marcados === caixas.length;
        todos.indeterminate = marcados > 0 && marcados < caixas.length;
      }
    };
    if (todos) {
      todos.addEventListener('change', () => {
        caixas.forEach((c) => { c.checked = todos.checked; });
        atualizar();
      });
    }
    caixas.forEach((c) => c.addEventListener('change', atualizar));
    atualizar();
  });

  // ── Prévia dos vídeos ─────────────────────────────────────
  const dialogo = document.getElementById('admVideo');
  const player = document.getElementById('admVideoPlayer');
  const titulo = document.getElementById('admVideoTitulo');
  const url = document.getElementById('admVideoUrl');

  function fecharVideo() {
    player.pause();
    player.removeAttribute('src');
    player.load();
    if (dialogo.open) dialogo.close();
  }

  document.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-video]');
    if (botao && dialogo) {
      titulo.textContent = botao.dataset.titulo || 'Vídeo';
      url.textContent = botao.dataset.video;
      player.src = botao.dataset.video;
      dialogo.showModal();
      player.play().catch(() => { /* o navegador pode exigir um clique no play */ });
      return;
    }
    if (e.target.closest('[data-fechar-dialogo]') || e.target === dialogo) fecharVideo();
  });
  if (dialogo) dialogo.addEventListener('close', () => { player.pause(); player.removeAttribute('src'); });

  // ── Edição em linha: fecha os outros "Editar" ao abrir um ──
  document.querySelectorAll('.adm-detalhes').forEach((d) => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      document.querySelectorAll('.adm-detalhes[open]').forEach((outro) => { if (outro !== d) outro.open = false; });
      const campo = d.querySelector('input:not([type="hidden"])');
      if (campo) campo.focus();
    });
  });

  // ── Formulário de curso: campos de vídeo x artigo e miniatura do YouTube ──
  const formCurso = document.querySelector('[data-form-curso]');
  if (formCurso) {
    const link = formCurso.querySelector('#link');
    const rotulo = formCurso.querySelector('label[for="link"]');
    const previa = formCurso.querySelector('[data-previa-video]');
    const soVideo = formCurso.querySelectorAll('[data-so-video]');
    const tipoAtual = () => (formCurso.querySelector('[data-tipo-curso]:checked') || {}).value;
    const idYoutube = (v) => {
      const t = (v || '').trim();
      if (/^[\w-]{11}$/.test(t)) return t;
      const m = t.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
      return m ? m[1] : null;
    };
    const atualizar = () => {
      const video = tipoAtual() === 'video';
      rotulo.textContent = video ? rotulo.dataset.rotuloVideo : rotulo.dataset.rotuloArtigo;
      soVideo.forEach((el) => { el.hidden = !video; });
      const id = video ? idYoutube(link.value) : null;
      previa.hidden = !id;
      if (id) previa.querySelector('img').src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    };
    formCurso.querySelectorAll('[data-tipo-curso]').forEach((r) => r.addEventListener('change', atualizar));
    link.addEventListener('input', atualizar);
  }
})();
