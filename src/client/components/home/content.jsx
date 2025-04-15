"use client";

import { BookOpen, GraduationCap, Infinity } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ContentHome() {
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState("");
  const router = useRouter();

  const handleSearch = () => {
    if (input.trim() !== "") {
      const existingHistory = JSON.parse(localStorage.getItem("searchHistory")) || [];
      const newEntry = {
        text: input,
        video: "/videos/default.mp4", // Aqui você pode ajustar o vídeo dependendo da palavra
        timestamp: new Date().toLocaleTimeString()
      };
      const updatedHistory = [...existingHistory, newEntry];
      localStorage.setItem("searchHistory", JSON.stringify(updatedHistory));
    }

    setIsLoading(true);
    setTimeout(() => {
      router.push("/translator");
    }, 2000);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-blue-50 to-orange-100">
        <div className="flex flex-col items-center">
          <span className="animate-spin h-12 w-12 border-4 border-darkbluetradu border-t-transparent rounded-full mb-4"></span>
          <p className="text-darkbluetradu font-semibold text-lg">Carregando tradução...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-orange-100 p-6">
      <h1 className="text-4xl font-bold text-gray-900 text-center">
        Boas-vindas ao{" "}
        <span className="text-black px-2 rounded-md bg-gradient-to-r from-orange-700 via-orange-500 to-orange-300 bg-clip-text text-transparent">
          Tradulibras
        </span>
      </h1>
      <p className="text-gray-600 mt-2">Traduzindo palavras em inclusão...</p>

      {/* Input e botão */}
      <div className="mt-6 flex items-center w-full justify-center">
        <div className="relative transition-all duration-300">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress} // Adicionando o evento para a tecla Enter
            placeholder='Exemplo : "Aranha"'
            className="transition-all duration-300 ease-in-out w-80 focus:w-290 p-3 rounded-l-lg border border-gray-300 text-gray-700 focus:outline-none bg-bluetradu/20"
          />
        </div>
        <button
          onClick={handleSearch}
          className="bg-darkbluetradu text-white px-5 py-3 rounded-r-lg hover:bg-darkbluetradu/70"
        >
          &gt;
        </button>
      </div>

      <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <button className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition transform hover:scale-105 flex flex-col items-center">
          <BookOpen className="text-darkbluetradu w-12 h-12 mb-2" />
          <h3 className="text-lg font-semibold text-orangetradu mt-2">Traduzir</h3>
          <p className="text-gray-600 text-sm">
            Converta palavras em Libras de forma rápida e intuitiva.
          </p>
        </button>
        <button className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition transform hover:scale-105 flex flex-col items-center">
          <GraduationCap className="text-darkbluetradu w-12 h-12 mb-2" />
          <h3 className="text-lg font-semibold text-orangetradu mt-2">Aprender</h3>
          <p className="text-gray-600 text-sm">
            Descubra novos sinais e amplie seu conhecimento em Libras.
          </p>
        </button>
        <button className="p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition transform hover:scale-105 flex flex-col items-center">
          <Infinity className="text-darkbluetradu w-12 h-12 mb-2" />
          <h3 className="text-lg font-semibold text-orangetradu mt-2">Incluir</h3>
          <p className="text-gray-600 text-sm">
            Facilite a comunicação e torne o diálogo mais acessível.
          </p>
        </button>
      </div>
    </div>
  );
}
