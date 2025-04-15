"use client";

import { useState } from "react";

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch("http://localhost:5000/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ input_text: inputText }),
        mode: "cors",
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      setResult({ error: "Falha ao obter os resultados." });
    }
  };

  return (
    <main className="home">
      {/* Título */}
      <h2 className="translate">TRADUTOR</h2>

      {/* Botão de Logout */}
      <div>
        <a href="/login/logout" className="button-logout">
          <i className="material-icons">logout</i>
        </a>
      </div>

      {/* Menu Hamburguer */}
      <button
        className="hamburger-menu"
        id="hamburgerMenu"
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <div></div>
        <div></div>
        <div></div>
      </button>

      {/* Opções do Menu */}
      {menuOpen && (
        <div className="menu-options" id="menuOptions">
          <a href="#">Opção 1</a>
          <a href="#">Opção 2</a>
          <a href="#">Opção 3</a>
        </div>
      )}

      {/* Formulário de Busca */}
      <form id="searchForm" onSubmit={handleSubmit}>
        <label htmlFor="input_text">Digite uma palavra ou expressão:</label>
        <input
          type="text"
          id="input_text"
          name="input_text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>

      {/* Resultado */}
      <div className="resultado" id="result">
        {result && (
          <>
            {result.error ? (
              <p>{result.error}</p>
            ) : (
              <>
                <p>Expressão: {result.expression}</p>
                <div className="video-container">
                  <video controls autoPlay>
                    <source src={result.url} type="video/mp4" />
                    Seu navegador não suporta o elemento de vídeo.
                  </video>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
