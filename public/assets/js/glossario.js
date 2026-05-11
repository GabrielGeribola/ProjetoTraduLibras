fetch('/data/glossario.json')
  .then(response => response.json())
  .then(glossario => {

    const container = document.getElementById('glossario-container');

    // AGRUPAR POR CATEGORIA
    const categorias = {};

    glossario.forEach(item => {

      const categoria = item.categoria || 'Outros';

      if (!categorias[categoria]) {
        categorias[categoria] = [];
      }

      categorias[categoria].push(item);
    });

    // RENDERIZAR
    Object.keys(categorias).forEach(categoria => {

            // HEADER DA CATEGORIA
      const titulo = document.createElement('div');

      titulo.textContent = `▼ ${categoria}`;

      titulo.style.marginTop = '30px';
      titulo.style.marginBottom = '15px';
      titulo.style.color = '#1e293b';
      titulo.style.fontSize = '32px';
      titulo.style.fontWeight = 'bold';
      titulo.style.cursor = 'pointer';
      titulo.style.userSelect = 'none';

      // CONTAINER DOS LINKS
      const grupo = document.createElement('div');

      grupo.style.display = 'flex';
      grupo.style.flexWrap = 'wrap';
      grupo.style.gap = '10px';

      categorias[categoria].forEach(item => {

        const link = document.createElement('a');

        link.textContent = item.label;

        link.href = `/home?word=${encodeURIComponent(item.label)}`;

        // ESTILO
        link.style.padding = '8px 12px';
        link.style.background = '#e2e8f0';
        link.style.borderRadius = '8px';
        link.style.textDecoration = 'none';
        link.style.color = '#0f172a';
        link.style.fontWeight = 'bold';
        link.style.transition = '0.2s';

        link.addEventListener('mouseover', () => {
          link.style.background = '#cbd5e1';
        });

        link.addEventListener('mouseout', () => {
          link.style.background = '#e2e8f0';
        });

        grupo.appendChild(link);
      });
      
      container.appendChild(titulo);
      container.appendChild(grupo);

      // EXPANDIR / RECOLHER
      let aberto = true;

      titulo.addEventListener('click', () => {

        aberto = !aberto;

        if (aberto) {
          grupo.style.display = 'flex';
          titulo.textContent = `▼ ${categoria}`;
        } else {
          grupo.style.display = 'none';
          titulo.textContent = `► ${categoria}`;
        }

      });
    });

  })
  .catch(error => {
    console.error('Erro ao carregar glossário:', error);
  });