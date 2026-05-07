async function carregarGlossario() {
  try {
    const response = await fetch("/data/glossario.json");
    const glossario = await response.json();

    const container = document.getElementById("glossario-container");

    glossario.forEach(item => {
      const link = document.createElement("a");

      link.href = `/translate?word=${item.slug}`;
      link.textContent = item.word;

      link.classList.add("glossario-item");

      container.appendChild(link);
    });

  } catch (error) {
    console.error("Erro ao carregar glossário:", error);
  }
}

carregarGlossario();