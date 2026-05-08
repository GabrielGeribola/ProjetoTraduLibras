fetch('/data/glossario.json')
  .then(response => response.json())
  .then(glossario => {

    const container = document.getElementById('glossario-container');

    glossario.forEach(item => {

      const link = document.createElement('a');

      // TEXTO VISÍVEL
      link.textContent = item.label;

      // LINK PARA HOME
      link.href = `/home?word=${encodeURIComponent(item.label)}`;

      // ESTILO
      link.style.display = 'inline-block';
      link.style.margin = '5px';
      link.style.padding = '8px 12px';
      link.style.background = '#e2e8f0';
      link.style.borderRadius = '8px';
      link.style.textDecoration = 'none';
      link.style.color = '#0f172a';
      link.style.fontWeight = 'bold';

      container.appendChild(link);
    });

  })
  .catch(error => {
    console.error('Erro ao carregar glossário:', error);
  });