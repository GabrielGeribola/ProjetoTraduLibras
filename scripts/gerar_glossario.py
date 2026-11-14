"""Gera public/data/glossario.json com as palavras que têm sinal e suas categorias.

Uso (com a API rodando):
    python scripts/gerar_glossario.py [--api http://localhost:5000] [--saida public/data/glossario.json]

Ordem de decisão da categoria de cada palavra:
  1. scripts/glossario_manual.json (definido pela equipe; sempre vence)
  2. Regras simples: letra solta -> Alfabeto; número -> Números e quantidades
  3. WordNet em português (OpenWordnet-PT, via NLTK/OMW 1.4): grupo de significado da palavra
     ou do seu lema (spaCy); infinitivos com sentido de verbo -> Ações (verbos)
  4. Classe gramatical do spaCy: verbo -> Ações; adjetivo -> Qualidades
  5. Expressões com várias palavras não reconhecidas -> Expressões; o resto -> Outros

Requisitos (uma vez): python -c "import nltk; nltk.download('wordnet'); nltk.download('omw-1.4')"
"""
import argparse
import json
import re
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import nltk
import spacy
from nltk.corpus import wordnet as wn

RAIZ = Path(__file__).resolve().parent.parent
MANUAL = Path(__file__).resolve().parent / "glossario_manual.json"

# Ordem em que as categorias aparecem na página (a mesma lista fica em public/assets/js/glossario.js)
CATEGORIAS = [
    "Alimentos e bebidas", "Animais", "Natureza", "Corpo e saúde",
    "Pessoas, família e profissões", "Sentimentos e emoções", "Lugares", "Objetos",
    "Tempo e datas", "Comunicação e linguagem", "Educação e conhecimento",
    "Sociedade, trabalho e dinheiro", "Números e quantidades", "Alfabeto",
    "Ações (verbos)", "Qualidades (adjetivos)", "Expressões", "Outros",
]

# Grupos de significado do WordNet ("lexnames") -> categoria do glossário
LEXNAME_CATEGORIA = {
    "noun.food": "Alimentos e bebidas",
    "noun.animal": "Animais",
    "noun.plant": "Natureza", "noun.object": "Natureza", "noun.phenomenon": "Natureza",
    "noun.substance": "Natureza",
    "noun.body": "Corpo e saúde",
    "noun.person": "Pessoas, família e profissões",
    "noun.feeling": "Sentimentos e emoções",
    "noun.location": "Lugares",
    "noun.artifact": "Objetos",
    "noun.time": "Tempo e datas",
    "noun.communication": "Comunicação e linguagem",
    "noun.cognition": "Educação e conhecimento",
    "noun.group": "Sociedade, trabalho e dinheiro", "noun.possession": "Sociedade, trabalho e dinheiro",
    "noun.act": "Sociedade, trabalho e dinheiro",
    "noun.quantity": "Números e quantidades",
    "adj.all": "Qualidades (adjetivos)", "adj.pert": "Qualidades (adjetivos)", "adj.ppl": "Qualidades (adjetivos)",
}
# verb.* -> Ações (verbos). Grupos genéricos (noun.state, noun.attribute, noun.event, adv.all...) não decidem.

PALAVRAS_VAZIAS = {"a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
                   "um", "uma", "para", "por", "com", "que", "se", "ao", "à"}


def normalizar(texto):
    sem_acento = unicodedata.normalize("NFD", texto)
    sem_acento = "".join(c for c in sem_acento if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", sem_acento.lower().replace("_", " ")).strip()


def carregar_wordnet_pt():
    """Lê o OpenWordnet-PT de dentro do omw-1.4.zip: lema -> lista de synsets."""
    ponteiro = nltk.data.find("corpora/omw-1.4.zip")
    caminho = Path(getattr(ponteiro, "path", None) or ponteiro.zipfile.filename)
    exato, sem_acento = defaultdict(list), defaultdict(list)
    with zipfile.ZipFile(caminho) as z, z.open("omw-1.4/por/wn-data-por.tab") as f:
        for linha in f.read().decode("utf-8").splitlines():
            partes = linha.split("\t")
            if len(partes) != 3 or partes[1] not in ("lemma", "por:lemma"):
                continue
            offset_pos, _, lema = partes
            lema = lema.lower().replace("_", " ").strip()
            exato[lema].append(offset_pos)
            sem_acento[normalizar(lema)].append(offset_pos)
    return exato, sem_acento


def synset(offset_pos):
    offset, pos = offset_pos.rsplit("-", 1)
    try:
        return wn.synset_from_pos_and_offset(pos, int(offset))
    except Exception:
        return wn.synset_from_pos_and_offset("a" if pos == "s" else pos, int(offset))


def pontuar(offsets):
    """Soma o peso de cada categoria; sentidos mais frequentes (contagem do SemCor) pesam mais."""
    pontos, verbo = Counter(), 0.0
    for op in dict.fromkeys(offsets):
        s = synset(op)
        peso = 1 + sum(l.count() for l in s.lemmas())
        lex = s.lexname()
        if lex == "noun.act":
            peso *= 0.5  # grupo muito amplo ("ato de ..."): só decide se nenhum outro sentido aparecer
        if lex.startswith("verb."):
            verbo += peso
        elif lex in LEXNAME_CATEGORIA:
            pontos[LEXNAME_CATEGORIA[lex]] += peso
    return pontos, verbo


def categoria_wordnet(palavra, lema, wn_exato, wn_sem_acento):
    offsets = []
    for termo in dict.fromkeys([palavra.lower(), (lema or "").lower()]):
        if termo:
            offsets += wn_exato.get(termo) or wn_sem_acento.get(normalizar(termo), [])
    if not offsets:
        return None
    pontos, verbo = pontuar(offsets)
    eh_infinitivo = re.search(r"(ar|er|ir|or|ôr)$", normalizar(palavra)) is not None
    if verbo and eh_infinitivo and verbo >= 0.5 * max(pontos.values(), default=0):
        return "Ações (verbos)"
    if not pontos:
        return "Ações (verbos)" if verbo else None
    # Frutas/legumes aparecem como planta e como alimento: alimento tem prioridade
    if "Alimentos e bebidas" in pontos:
        pontos["Alimentos e bebidas"] *= 1.5
    return pontos.most_common(1)[0][0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:5000")
    parser.add_argument("--saida", default=str(RAIZ / "public" / "data" / "glossario.json"))
    args = parser.parse_args()

    with urllib.request.urlopen(f"{args.api}/api/glossario", timeout=60) as r:
        palavras = json.load(r)["palavras"]

    manual = {normalizar(k): v for k, v in json.loads(MANUAL.read_text(encoding="utf-8")).items() if not k.startswith("_")}
    invalidas = set(manual.values()) - set(CATEGORIAS)
    if invalidas:
        raise SystemExit(f"Categorias inválidas em {MANUAL.name}: {invalidas}")

    wn_exato, wn_sem_acento = carregar_wordnet_pt()
    nlp = spacy.load("pt_core_news_sm")
    docs = {p: d for p, d in zip(palavras, nlp.pipe([p.lower() for p in palavras], batch_size=256))}

    def classificar(label):
        chave = normalizar(label)
        if chave in manual:
            return manual[chave], "manual"
        if len(chave) == 1 and chave.isalpha():
            return "Alfabeto", "regra"
        if re.fullmatch(r"\d+([.,]\d+)?", chave):
            return "Números e quantidades", "regra"

        # "Droga, medicamento" -> classifica pelo primeiro termo
        principal = label.split(",")[0].strip() if "," in label else label
        # No banco há expressões gravadas com "_" ou "-" no lugar do espaço (meia_calca, farinha-de-rosca)
        principal = re.sub(r"[_]+", " ", principal).strip()
        if "-" in principal and not categoria_wordnet(principal, None, wn_exato, wn_sem_acento):
            principal = principal.replace("-", " ")
        doc = docs[label] if principal == label else nlp(principal.lower())
        tokens = [t for t in doc if not t.is_punct]

        if len(tokens) == 1:
            t = tokens[0]
            cat = categoria_wordnet(principal, t.lemma_, wn_exato, wn_sem_acento)
            if cat:
                return cat, "wordnet"
            # Palavra fora do WordNet: o palpite do spaCy só vale com terminação típica
            forma = normalizar(principal)
            if t.pos_ in ("VERB", "AUX") and re.search(r"(ar|er|ir|or)$", forma):
                return "Ações (verbos)", "spacy"
            if t.pos_ == "ADJ" and re.search(r"(oso|osa|vel|ivo|iva|ente|ante|ico|ica|ado|ada|ido|ida|ento|enta)$", forma):
                return "Qualidades (adjetivos)", "spacy"
            if t.pos_ == "NUM":
                return "Números e quantidades", "spacy"
            if re.search(r"ista$", forma) and len(forma) > 5:  # eletricista, motorista, dentista
                return "Pessoas, família e profissões", "regra"
            return "Outros", "sem-dados"

        # Expressão com várias palavras: tenta a expressão inteira e depois a primeira palavra de conteúdo
        cat = categoria_wordnet(principal, None, wn_exato, wn_sem_acento)
        if cat:
            return cat, "wordnet"
        conteudo = [t for t in tokens if t.text not in PALAVRAS_VAZIAS]
        if conteudo:
            t = conteudo[0]
            cat = categoria_wordnet(t.text, t.lemma_, wn_exato, wn_sem_acento)
            if cat and cat not in ("Qualidades (adjetivos)",):
                return cat, "wordnet-1a-palavra"
        return "Expressões", "regra"

    itens, fontes = [], Counter()
    for i, label in enumerate(sorted(palavras, key=lambda p: normalizar(p)), start=1):
        categoria, fonte = classificar(label)
        fontes[fonte] += 1
        chave = normalizar(label)
        itens.append({"id": i, "key": chave, "label": label, "categoria": categoria,
                      "tags": [normalizar(categoria), chave]})

    Path(args.saida).write_text(json.dumps(itens, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    contagem = Counter(i["categoria"] for i in itens)
    print(f"{len(itens)} palavras -> {args.saida}")
    for cat in CATEGORIAS:
        print(f"  {contagem.get(cat, 0):5d}  {cat}")
    print("origem da decisão:", dict(fontes))


if __name__ == "__main__":
    main()
