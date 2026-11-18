"""
Compara modelos de embeddings para a etapa "semelhança de significado" do tradutor.

Essa etapa só roda para palavras reais que não têm sinal próprio no banco. Ela só vale a pena
se trouxer sinônimos corretos (cão -> CACHORRO) SEM trazer trocas erradas (triste -> FELIZ,
domingo -> SÁBADO). Para cada modelo e limiar, mostra quantos sinônimos acertou e quantos
sinais errados devolveu.

Uso (na raiz do projeto, com a venv ativada):
  python scripts/avaliar_modelos_semanticos.py
  python scripts/avaliar_modelos_semanticos.py --modelos intfloat/multilingual-e5-large
"""
import argparse
import os
import sys
import time

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "scripts"))

MODELOS = [
    "sentence-transformers/paraphrase-MiniLM-L6-v2",            # o atual
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    "sentence-transformers/paraphrase-multilingual-mpnet-base-v2",
    "intfloat/multilingual-e5-large",
    "BAAI/bge-m3",
    "rufimelo/bert-large-portuguese-cased-sts",
]

# palavra sem sinal no banco -> sinais aceitáveis (qualquer um)
POSITIVOS = {
    "residência": ["casa", "lar"], "moradia": ["casa", "lar"], "cão": ["cachorro"], "felino": ["gato"],
    "refeição": ["comida"], "alimento": ["comida"], "veloz": ["rápido"], "gigante": ["grande", "grande enorme"],
    "minúsculo": ["pequeno"], "docente": ["professor"], "estudante": ["aluno"], "colégio": ["escola"],
    "residir": ["morar"], "habitar": ["morar"], "dizer": ["falar"], "observar": ["ver", "olhar"],
    "enxergar": ["ver"], "escutar": ["ouvir"], "auxiliar": ["ajudar"], "desejar": ["querer", "impulso desejo"],
    "caminhar": ["andar"], "saltar": ["pular"], "cochilar": ["dormir"], "lecionar": ["ensinar"],
    "grana": ["dinheiro"], "neném": ["bebê"], "município": ["cidade"], "nação": ["país"],
    "smartphone": ["celular"], "refrigerador": ["geladeira"], "calçado": ["sapato"], "vestimenta": ["roupa"],
    "belo": ["bonito", "lindo"], "exausto": ["cansado"], "enfermo": ["doente"], "felicidade": ["feliz", "alegria"],
    "pavor": ["medo", "com medo"], "receio": ["medo", "com medo"], "ira": ["raiva"], "fúria": ["raiva"],
    "finalizar": ["acabar", "fim", "terminar"], "regressar": ["voltar"], "retornar": ["voltar"],
    "iniciar": ["começar"], "esposo": ["marido"], "vovó": ["avó", "avo"], "vovô": ["avô", "avo"],
    "bicho": ["animal"], "zangado": ["raiva", "bravo"], "irritado": ["raiva", "bravo"],
    "automobilístico": ["carro", "automóvel"], "lindíssimo": ["lindo"], "mansão": ["casa"],
    "patrão": ["chefe"], "tristeza": ["triste"], "carinhoso": ["carinho"], "telefonema": ["chamada por telefone"],
}
# palavras sem sinal aceitável no banco: qualquer sinal devolvido é um erro
NEGATIVOS = ["bom", "triste", "comprar", "vender", "dois", "sim", "tchau", "precisar", "usar", "vermelho",
             "domingo", "seis", "sete", "devagar", "suco", "rua", "trem", "abrir", "brincar", "ouvinte", "cedo",
             "magro", "gordo", "pobre", "rico", "barato", "esquerdo", "primeiro", "último", "ontem", "noivo",
             "tio", "prima", "sobrinho", "julho", "dezembro", "quinta", "maio", "verde", "roxo", "laranja",
             "limão", "uva", "pera", "cebola", "alho", "joelho", "cotovelo", "ombro", "costas"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--modelos", nargs="*", default=MODELOS)
    args = p.parse_args()

    from avaliar_traducao import carregar_env, chave
    carregar_env()
    import tradutor
    motor = tradutor.Tradutor.criar_do_ambiente(modelo_embedding="nenhum")
    idx = motor._indice

    positivos = {}
    for palavra, alvos in POSITIVOS.items():
        alvos_ok = [chave(a) for a in alvos if idx.existe(a)]
        if not idx.existe(palavra) and alvos_ok:
            positivos[palavra] = alvos_ok
    negativos = [n for n in NEGATIVOS if not idx.existe(n)]
    print(f"{len(positivos)} sinônimos para achar | {len(negativos)} palavras que devem ficar sem sinal")
    print("ignorados (palavra já existe ou alvo não existe):",
          [p for p in POSITIVOS if p not in positivos], [n for n in NEGATIVOS if n not in negativos])

    resumo = []
    for nome in args.modelos:
        print(f"\n######## {nome}")
        inicio = time.time()
        try:
            busca = tradutor.BuscaSemantica(nome, idx)
        except Exception as e:
            print("  falhou ao carregar:", e)
            continue
        print(f"  carregado e embeddings calculados em {time.time() - inicio:.0f}s")
        linhas = []
        for palavra in list(positivos) + negativos:
            c = busca.candidatos(palavra, k=2)
            margem = c[0][1] - c[1][1] if len(c) > 1 else 1.0
            linhas.append((palavra, palavra in positivos, c[0][0], c[0][1], margem))

        melhor = None
        for limiar in np.arange(0.50, 0.99, 0.01):
            for margem_min in (0.0, 0.02, 0.05):
                certos = errados = 0
                for palavra, eh_pos, top, nota, margem in linhas:
                    if nota < limiar or margem < margem_min:
                        continue
                    if eh_pos and top in positivos[palavra]:
                        certos += 1
                    else:
                        errados += 1
                if certos and errados == 0 and (melhor is None or certos > melhor[2]):
                    melhor = (round(float(limiar), 2), margem_min, certos)
        for palavra, eh_pos, top, nota, margem in sorted(linhas, key=lambda x: -x[3])[:25]:
            ok = "✔" if eh_pos and top in positivos.get(palavra, []) else "✘"
            print(f"   {ok} {palavra:>16} -> {top:<22} {nota:.3f} (margem {margem:.3f})")
        if melhor:
            print(f"  >>> melhor configuração SEM nenhum erro: limiar {melhor[0]}, margem {melhor[1]} "
                  f"-> {melhor[2]}/{len(positivos)} sinônimos achados")
        else:
            print("  >>> nenhuma configuração acerta sinônimos sem errar")
        resumo.append((nome, melhor))

    print("\n=== RESUMO (sinônimos achados sem nenhum sinal errado)")
    for nome, melhor in resumo:
        print(f"  {nome:<62} {'%d/%d (limiar %.2f, margem %.2f)' % (melhor[2], len(positivos), melhor[0], melhor[1]) if melhor else 'nenhum'}")


if __name__ == "__main__":
    main()
