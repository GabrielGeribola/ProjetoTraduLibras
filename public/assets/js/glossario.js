fetch('/data/glossario.json')
  .then(response => response.json())
  .then(glossario => {

    const container = document.getElementById('glossario-container');

    // Agrupar por categoria
    const categorias = {};
    glossario.forEach(item => {
      const cat = item.categoria || 'Outros';
      if (!categorias[cat]) categorias[cat] = [];
      categorias[cat].push(item);
    });

    const ordemCategorias = ['Alimentos', 'Animais', 'Educação', 'Saúde', 'Outros'];

    ordemCategorias.forEach(categoria => {
      if (!categorias[categoria]) return;

      // Header da categoria
      const header = document.createElement('div');
      header.className = 'glossario-categoria-titulo aberto';

      const seta = document.createElement('span');
      seta.className = 'glossario-seta';
      seta.textContent = '›';

      const label = document.createElement('span');
      label.textContent = categoria;

      header.appendChild(seta);
      header.appendChild(label);

      // Grupo de links
      const grupo = document.createElement('div');
      grupo.className = 'glossario-grupo';

      categorias[categoria].forEach(item => {
        const link = document.createElement('a');
        link.className = 'glossario-tag';
        link.textContent = item.label;
        link.href = `/home?word=${encodeURIComponent(item.label)}`;
        grupo.appendChild(link);
      });

      container.appendChild(header);
      container.appendChild(grupo);

      // Expandir / recolher
      let aberto = true;

      header.addEventListener('click', () => {
        aberto = !aberto;
        if (aberto) {
          header.classList.add('aberto');
          grupo.classList.remove('fechado');
        } else {
          header.classList.remove('aberto');
          grupo.classList.add('fechado');
        }
      });
    });

  })
  .catch(error => {
    console.error('Erro ao carregar glossário:', error);
  });