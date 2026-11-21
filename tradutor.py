"""
Motor de tradução Português -> sequência de sinais em Libras.

Fluxo de uma frase:
  1. Normalização: abreviações de internet (vc -> você), números (2 -> dois).
  2. Análise gramatical (spaCy) e glosa: remove artigos, preposições, verbos de ligação (ser/estar)
     e conjunções; troca pronomes oblíquos (te -> você, me -> eu); reordena
     (tempo, objeto, sujeito, outros, verbo; pergunta no fim). Uma única palavra não passa pela glosa.
  3. Expressões do banco com mais de uma palavra ("por favor", "café da manhã") têm prioridade.
  4. Cada termo é procurado da forma mais confiável para a menos confiável, parando no primeiro acerto:
        exato -> sinônimo cadastrado -> lema -> variação (plural, feminino, diminutivo...) ->
        correção de digitação (só para palavras que NÃO existem em português) ->
        semelhança de significado (só palavras reais, limiar alto) -> soletrar (nomes próprios)
     Se nada for confiável, o termo fica sem sinal: é melhor do que mostrar um sinal errado.

Palavras reais nunca são "corrigidas" para outra parecida (era assim que "linda" virava AINDA e
"dois" virava COISA). A correção por letras só vale para o que não existe em português.
"""
import json
import logging
import os
import re
import threading
import time
import unicodedata
from dataclasses import dataclass

import numpy as np
import simplemma
from Levenshtein import distance as levenshtein

log = logging.getLogger("api_tradu.tradutor")

RAIZ = os.path.dirname(os.path.abspath(__file__))
DIR_DADOS = os.path.join(RAIZ, "dados_traducao")
DIR_CACHE = os.path.join(RAIZ, ".cache_embeddings")

MODELO_SPACY_PADRAO = "pt_core_news_md"  # nos testes, empatou com o lg e foi melhor que o sm
MODELO_EMBEDDING_PADRAO = "nenhum"
LIMIAR_SEMANTICO_PADRAO = 0.90
MARGEM_SEMANTICA = 0.03         # o melhor candidato precisa ganhar do segundo por essa folga
CACHE_TTL_SEGUNDOS = int(os.getenv("CACHE_TTL_SEGUNDOS", "3600"))

EXTENSOES_ARQUIVO = re.compile(r"\.(mp4|webm|gif|mov|png|jpe?g)$", re.I)


# ----------------------------------------------------------------------------------------------
# Texto
# ----------------------------------------------------------------------------------------------
def tirar_acentos(texto):
    texto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in texto if not unicodedata.combining(c))


def limpar(texto):
    """Minúsculas, hífen/sublinhado viram espaço, sem pontuação, espaços simples (mantém acentos)."""
    texto = unicodedata.normalize("NFC", (texto or "").lower())
    texto = re.sub(r"[-_]", " ", texto)
    texto = re.sub(r"[^\w ]", " ", texto)
    return " ".join(texto.split())


def chave(texto):
    """Chave de busca: como limpar(), mas também sem acentos."""
    return tirar_acentos(limpar(texto))


def normalizar_sinal(texto):
    """Forma usada para comparar sinais ocultados pelo usuário (minúsculo, espaços simples)."""
    return " ".join((texto or "").split()).lower()


def carregar_json(nome):
    with open(os.path.join(DIR_DADOS, nome), encoding="utf-8") as f:
        dados = json.load(f)
    return {k: v for k, v in dados.items() if not k.startswith("_")}


# ----------------------------------------------------------------------------------------------
# Morfologia: variações de uma palavra (só são usadas se o resultado existir no banco)
# ----------------------------------------------------------------------------------------------
PLURAL = [("ões", "ão"), ("ães", "ão"), ("ãos", "ão"), ("oes", "ao"), ("aes", "ao"), ("aos", "ao"),
          ("ais", "al"), ("éis", "el"), ("eis", "el"), ("óis", "ol"), ("ois", "ol"), ("uis", "ul"),
          ("ns", "m"), ("res", "r"), ("zes", "z"), ("ses", "s"), ("s", ""), ("es", "")]
GENERO = [("ora", "or"), ("esa", "ês"), ("ã", "ão"), ("a", "o")]
DIMINUTIVO_SEGURO = [("zinho", ""), ("zinha", "")]
DIMINUTIVO = [("quinho", "co"), ("quinha", "ca"), ("guinho", "go"), ("guinha", "ga"),
              ("inho", "o"), ("inha", "a")]
AUMENTATIVO_SEGURO = [("zão", ""), ("zao", ""), ("zona", "")]
AUMENTATIVO = [("ão", "o"), ("ao", "o")]
VERBAL = [("ando", "ar"), ("endo", "er"), ("indo", "ir"), ("ado", "ar"), ("ada", "ar"), ("ido", "er"),
          ("ido", "ir"), ("amos", "ar"), ("emos", "er"), ("imos", "ir"), ("aram", "ar"), ("eram", "er"),
          ("iram", "ir"), ("am", "ar"), ("em", "er"), ("em", "ir"), ("ei", "ar"), ("ou", "ar"),
          ("eu", "er"), ("iu", "ir"), ("ava", "ar"), ("ia", "er"), ("ia", "ir"), ("o", "ar"),
          ("o", "er"), ("o", "ir"), ("a", "ar"), ("e", "er"), ("e", "ir"), ("as", "ar"), ("es", "er")]
# Palavras terminadas em -inho/-inha que não são diminutivos (carinho não é um "caro pequeno")
NAO_DIMINUTIVOS = {"carinho", "caminho", "vizinho", "vizinha", "focinho", "golfinho", "galinha",
                   "cozinha", "farinha", "rainha", "linha", "ninho", "vinho", "espinho", "moinho",
                   "padrinho", "madrinha", "sobrinho", "sobrinha", "campainha", "bainha", "andorinha",
                   "marinho", "marinha", "pinho", "adivinha", "sardinha", "bolinha", "calcinha",
                   "camisinha", "lanchinho", "pastelzinho"}


GENERO_MANTER = {
    # dias da semana, lados, ordinais usados como substantivo: o masculino tem outro sentido
    "segunda", "terça", "terca", "quarta", "quinta", "sexta", "direita", "esquerda",
    # parentesco e títulos: em Libras costumam ter sinal próprio para cada gênero
    "neta", "tia", "avó", "avo", "prima", "sobrinha", "madrinha", "afilhada", "sogra", "nora", "cunhada",
    "enteada", "madrasta", "comadre", "rainha", "princesa", "mulher", "moça", "senhora", "dona", "mãe",
    "filha", "irmã", "irma", "esposa", "noiva", "menina", "garota",
    # substantivos femininos cujo "masculino" é outra palavra
    "conta", "ponta", "marca", "cara", "porta", "pasta", "manga", "bola", "mala", "fila", "casa", "mesa",
    "fruta", "roupa", "sala", "cesta", "forma", "caixa", "carta", "banca", "planta", "lata", "rota",
}


def aplicar(palavra, regras, minimo=2):
    """Troca o sufixo da palavra por cada regra (sufixo, troca); o resultado precisa ter `minimo` letras."""
    saida = []
    for sufixo, troca in regras:
        if palavra.endswith(sufixo) and len(palavra) > len(sufixo):
            nova = palavra[: len(palavra) - len(sufixo)] + troca
            if len(nova) >= minimo and nova not in saida:
                saida.append(nova)
    return saida


def com_nasal(formas):
    """'tren' -> 'trem' (sobra de trenzinho)."""
    saida = list(formas)
    for f in formas:
        if f.endswith("n"):
            saida.append(f[:-1] + "m")
    return saida


# ----------------------------------------------------------------------------------------------
# Correção de digitação (só para palavras que não existem em português)
# ----------------------------------------------------------------------------------------------
def fonetica(palavra):
    """Chave aproximada de pronúncia: 'carru' e 'carro' viram a mesma coisa."""
    p = tirar_acentos(palavra.lower())
    p = p.replace("ç", "s").replace("ch", "x").replace("lh", "li").replace("y", "i").replace("k", "c")
    p = re.sub(r"(.)\1+", r"\1", p)
    p = p.replace("z", "s")
    p = re.sub(r"us$", "os", p)
    p = re.sub(r"u$", "o", p)
    p = re.sub(r"is$", "es", p)
    p = re.sub(r"i$", "e", p)
    return p


def formas_corrigidas(palavra):
    """Versões prováveis de uma palavra digitada errado, da que muda menos para a que muda mais."""
    p = tirar_acentos(palavra.lower())
    formas = []

    def add(f):
        if f and f != p and f not in formas:
            formas.append(f)

    def final(f):
        f = re.sub(r"us$", "os", f)
        f = re.sub(r"u$", "o", f)
        f = re.sub(r"is$", "es", f)
        return re.sub(r"i$", "e", f)

    triplas = re.sub(r"(.)\1{2,}", r"\1\1", p)       # carrru -> carru
    vogais = re.sub(r"([aeiou])\1+", r"\1", triplas)  # laranjaas -> laranjas, sorriindo -> sorrindo
    todas = re.sub(r"(.)\1+", r"\1", p)               # azulll -> azul, pretto -> preto
    for base in [p, triplas, vogais, todas]:
        add(base)
        add(final(base))                              # carru -> carro, feijau -> feijao
        add(final(base).replace("z", "s"))            # televizao -> televisao
    return formas


_LEXICO = None
_LEXICO_LOCK = threading.Lock()


def carregar_lexico():
    """Todas as palavras do dicionário do simplemma (~900 mil formas), sem acento."""
    global _LEXICO
    if _LEXICO is None:
        with _LEXICO_LOCK:
            if _LEXICO is None:
                from simplemma.strategies.dictionaries import DefaultDictionaryFactory
                dicionario = DefaultDictionaryFactory().get_dictionary("pt")
                _LEXICO = frozenset(tirar_acentos(k.lower()) for k in dicionario.keys() if k.isalpha())
    return _LEXICO


def palavra_conhecida(forma):
    """True se a palavra existe em português, mesmo escrita sem acento ('terca' = 'terça')."""
    return tirar_acentos(forma.lower()) in carregar_lexico()


GENERO_MANTER_SEM_ACENTO = {tirar_acentos(p) for p in GENERO_MANTER}


def infinitivo_provavel(forma):
    """Infinitivo de uma forma verbal ('acordo' -> 'acordar'), ou None.
    Usa o lematizador e, se ele preferir a leitura de substantivo, as terminações verbais."""
    if not palavra_conhecida(forma):
        return None
    lema = simplemma.lemmatize(forma, lang="pt").lower()
    if lema != forma and re.search(r"(ar|er|ir|or)$", lema) and palavra_conhecida(lema):
        return lema
    for sufixo, troca in VERBAL:
        if forma.endswith(sufixo) and len(forma) > len(sufixo) + 1:
            candidato = forma[: len(forma) - len(sufixo)] + troca
            if candidato != forma and palavra_conhecida(candidato):
                return candidato
    return None


def limite_levenshtein(tamanho):
    if tamanho <= 3:
        return 0
    if tamanho <= 7:
        return 1
    return 2


# ----------------------------------------------------------------------------------------------
# Índice de sinais do banco
# ----------------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Sinal:
    id_word: int
    descricao: str      # texto exibido
    url: str
    chave: str          # sem acento
    acentuada: str      # com acento


class IndiceSinais:
    def __init__(self, linhas, sinonimos):
        """linhas: (id_word, description, url) em ordem de id_word."""
        self.por_chave = {}
        self.letras = {}
        apelidos = {}

        for id_word, descricao, url in linhas:
            bruto = " ".join((descricao or "").split())
            if not bruto or not url or EXTENSOES_ARQUIVO.search(bruto):
                continue
            acentuada = limpar(bruto)
            ch = tirar_acentos(acentuada)
            if not ch:
                continue
            sinal = Sinal(id_word, bruto, url, ch, acentuada)
            letra = re.fullmatch(r"(?:letra |lestra )?([a-z])", ch)
            if letra:
                # Letras do alfabeto manual: só para soletrar ("e" e "a" também são palavras)
                self.letras.setdefault(letra.group(1), sinal)
                continue
            self.por_chave.setdefault(ch, []).append(sinal)
            # "droga, medicamento": cada parte é outro nome do mesmo sinal
            if "," in bruto:
                for parte in bruto.split(","):
                    pc = chave(parte)
                    if pc and pc != ch:
                        apelidos.setdefault(pc, ch)

        # Sinônimos cadastrados à mão (dados_traducao/sinonimos.json)
        self.sinonimos = {}
        for origem, destino in sinonimos.items():
            co, cd = chave(origem), chave(destino)
            if cd not in self.por_chave:
                log.warning("[sinonimos] destino inexistente no banco: %r -> %r", origem, destino)
                continue
            self.sinonimos[co] = cd
        for origem, destino in apelidos.items():
            self.sinonimos.setdefault(origem, destino)

        todas = set(self.por_chave) | set(self.sinonimos)
        self.compostas = {c for c in todas if " " in c}
        self.max_palavras = max((len(c.split()) for c in self.compostas), default=1)
        self.simples = sorted(c for c in self.por_chave if " " not in c)
        self.por_fonetica = {}
        for c in self.simples:
            self.por_fonetica.setdefault(fonetica(c), []).append(c)

    # -- consultas --------------------------------------------------------------------------
    def sinais(self, forma, permitido):
        """Sinais da forma (acentuada ou não). Os de acento idêntico vêm primeiro."""
        acentuada = limpar(forma)
        lista = self.por_chave.get(tirar_acentos(acentuada))
        if not lista:
            return None
        exatos = [s for s in lista if s.acentuada == acentuada]
        for s in exatos + [s for s in lista if s.acentuada != acentuada]:
            if permitido(s):
                return s
        return None

    def sinonimo(self, forma):
        return self.sinonimos.get(chave(forma))

    def existe(self, forma):
        ch = chave(forma)
        return ch in self.por_chave or ch in self.sinonimos

    def mapa_chaves(self):
        """chave -> chave do sinal que será usado (para o script de avaliação)."""
        mapa = {c: c for c in self.por_chave}
        mapa.update({o: d for o, d in self.sinonimos.items() if o not in mapa})
        return mapa

    def glossario(self):
        """Uma descrição por palavra, preferindo a escrita com acento ('não' em vez de 'nao'),
        mais as letras do alfabeto manual."""
        palavras = {}
        for ch, lista in self.por_chave.items():
            melhor = max(lista, key=lambda s: (sum(1 for c in s.descricao if ord(c) > 127), -s.id_word))
            palavras[ch] = melhor.descricao
        letras = [c.upper() for c in sorted(self.letras)]
        return letras + sorted(palavras.values(), key=lambda d: chave(d))


# ----------------------------------------------------------------------------------------------
# Busca por semelhança de significado (embeddings)
# ----------------------------------------------------------------------------------------------
class BuscaSemantica:
    """Compara o termo com todos os sinais por significado. Só é usada como último recurso."""

    def __init__(self, nome_modelo, indice):
        from sentence_transformers import SentenceTransformer
        self.nome = nome_modelo
        self.modelo = SentenceTransformer(nome_modelo)
        self.prefixo = "query: " if "e5" in nome_modelo.lower() else ""
        self.atualizar(indice)

    def _codificar(self, textos):
        vetores = self.modelo.encode([self.prefixo + t for t in textos], batch_size=128,
                                     normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(vetores, dtype=np.float32)

    def atualizar(self, indice):
        chaves = sorted(indice.por_chave)
        textos = {c: indice.por_chave[c][0].descricao.lower() for c in chaves}
        arquivo = os.path.join(DIR_CACHE, re.sub(r"[^\w.-]", "_", self.nome) + ".npz")
        cache = {}
        if os.path.exists(arquivo):
            try:
                dados = np.load(arquivo, allow_pickle=False)
                cache = dict(zip(dados["textos"].tolist(), dados["vetores"]))
            except Exception:
                log.warning("[semantica] cache de embeddings ilegível, recalculando")
        faltando = sorted({t for t in textos.values() if t not in cache})
        if faltando:
            inicio = time.time()
            for t, v in zip(faltando, self._codificar(faltando)):
                cache[t] = v
            log.info("[semantica] %d embeddings calculados em %.0fs", len(faltando), time.time() - inicio)
            try:
                os.makedirs(DIR_CACHE, exist_ok=True)
                ts = sorted(cache)
                np.savez(arquivo, textos=np.array(ts), vetores=np.stack([cache[t] for t in ts]))
            except OSError:
                log.warning("[semantica] não foi possível gravar o cache em %s", DIR_CACHE)
        self.chaves = chaves
        self.matriz = np.stack([cache[textos[c]] for c in chaves]) if chaves else np.zeros((0, 1))

    def candidatos(self, texto, k=5):
        if not len(self.chaves):
            return []
        v = self._codificar([texto])[0]
        notas = self.matriz @ v
        ordem = np.argsort(-notas)[:k]
        return [(self.chaves[i], float(notas[i])) for i in ordem]


# ----------------------------------------------------------------------------------------------
# Glosa
# ----------------------------------------------------------------------------------------------
ARTIGOS = {"o", "a", "os", "as", "um", "uma", "uns", "umas"}
PREPOSICOES_COM_SINAL = {"sem", "contra", "até", "ate", "entre", "sobre", "durante", "depois", "antes",
                         "perto", "longe", "dentro", "fora"}
CONJUNCOES_SEM_SINAL = {"e", "nem"}
SUBORDINADAS_SEM_SINAL = {"que", "se"}
VERBOS_DE_LIGACAO = {"ser", "estar"}
AUXILIARES_SEM_SINAL = {"ser", "estar", "ter", "haver", "ficar"}
PRONOMES_OBLIQUOS = {"te": "você", "ti": "você", "me": "eu", "mim": "eu"}
PRONOMES_SEM_SINAL = {"se", "lhe", "lhes", "o", "a", "os", "as", "lo", "la", "los", "las", "no", "na"}
PRONOMES_ANTES_DE_VERBO = {"eu", "voce", "ele", "ela", "nos", "eles", "elas", "voces", "tu", "me", "te", "se",
                           "lhe"}
# Palavras que aparecem logo depois de um pronome sem serem verbo ("eu não", "ele também")
NAO_VERBOS_APOS_PRONOME = {"nao", "tambem", "sempre", "nunca", "ja", "ainda", "so", "muito", "bem", "mal",
                           "aqui", "ali", "la", "hoje", "ontem", "amanha", "agora", "depois", "antes", "que",
                           "e", "mas", "ou", "mesmo", "mesma", "todo", "toda", "todos", "todas", "apenas", "quase",
                           "talvez", "de", "da", "do", "com", "para", "pra", "por", "em", "no", "na", "a", "o"}
PARTICIPIO = re.compile(r"(ad|id)(o|a|os|as)$")  # obrigado, cansada: exato primeiro, não o verbo
ARTIGOS_E_POSSESSIVOS = {"o", "a", "os", "as", "um", "uma", "uns", "umas", "meu", "minha", "meus", "minhas",
                         "teu", "tua", "seu", "sua", "seus", "suas", "nosso", "nossa", "este", "esta", "esse",
                         "essa", "aquele", "aquela", "do", "da", "dos", "das", "no", "na", "nos", "nas"}
TEMPO = {"ontem", "hoje", "amanhã", "amanha", "agora", "anteontem"}
INTERROGATIVOS = {"onde", "quando", "quem", "qual", "quais", "como", "quanto", "quantos", "quanta",
                  "quantas", "cadê", "cade", "por que", "o que", "porque"}
NUMEROS = {"0": "zero", "1": "um", "2": "dois", "3": "três", "4": "quatro", "5": "cinco", "6": "seis",
           "7": "sete", "8": "oito", "9": "nove", "10": "dez"}


@dataclass
class Unidade:
    texto: str            # como o usuário escreveu (uma ou mais palavras)
    forma: str            # forma usada na busca (minúscula, com acento)
    pos: str = ""
    dep: str = ""
    lema_spacy: str = ""
    papel: str = "outro"
    composta: bool = False
    nome_proprio: bool = False
    isolada: bool = False     # a frase tem uma palavra só (sem contexto para a gramática)
    depois_de_pronome: bool = False
    verbo_forte: bool = False  # com certeza é verbo: só vale o sinal do verbo (eu como -> COMER, não COMO)
    posicao: int = 0


@dataclass
class Achado:
    sinal: Sinal
    metodo: str
    score: float = 1.0
    aproximado: bool = False


# ----------------------------------------------------------------------------------------------
# Tradutor
# ----------------------------------------------------------------------------------------------
class Tradutor:
    def __init__(self, carregar_linhas, modelo_spacy=None, modelo_embedding=None, limiar_semantico=None,
                 datilologia=True):
        """carregar_linhas: função sem argumentos que devolve [(id_word, description, url), ...]."""
        self._carregar_linhas = carregar_linhas
        self.datilologia = datilologia
        self.abreviacoes = {chave(k): v for k, v in carregar_json("abreviacoes.json").items()}
        self._sinonimos = carregar_json("sinonimos.json")
        self.nlp = self._carregar_spacy(modelo_spacy or MODELO_SPACY_PADRAO)
        self.limiar = LIMIAR_SEMANTICO_PADRAO if limiar_semantico is None else limiar_semantico
        carregar_lexico()
        self._indice = None
        self._carregado_em = 0.0
        self._lock = threading.Lock()
        self._atualizando = threading.Event()
        self.recarregar()
        nome_emb = modelo_embedding or MODELO_EMBEDDING_PADRAO
        self.semantica = None if nome_emb.lower() in ("", "nenhum", "none", "0") else BuscaSemantica(nome_emb, self._indice)

    @classmethod
    def criar_do_ambiente(cls, modelo_spacy=None, modelo_embedding=None, limiar_semantico=None):
        import mysql.connector

        def carregar_linhas():
            db = mysql.connector.connect(host=os.getenv("DB_HOST", "db"), user=os.getenv("DB_USER", "tradulibras"),
                                         password=os.getenv("DB_PASS", ""),
                                         database=os.getenv("DB_NAME", "app_tradu_embedding"))
            try:
                cur = db.cursor()
                cur.execute("""
                    SELECT w.id_word, w.description, a.url
                    FROM words_sl_br w
                    JOIN animation_sl_br a ON a.id_animation = w.id_animation
                    ORDER BY w.id_word
                """)
                return cur.fetchall()
            finally:
                db.close()

        limiar = limiar_semantico
        if limiar is None and os.getenv("LIMIAR_SEMANTICO"):
            limiar = float(os.environ["LIMIAR_SEMANTICO"])
        return cls(carregar_linhas,
                   modelo_spacy=modelo_spacy or os.getenv("MODELO_SPACY"),
                   modelo_embedding=modelo_embedding or os.getenv("MODELO_EMBEDDING"),
                   limiar_semantico=limiar,
                   datilologia=os.getenv("DATILOLOGIA", "1").lower() not in ("0", "false", "nao", "não"))

    @staticmethod
    def _carregar_spacy(nome):
        import spacy
        try:
            return spacy.load(nome)
        except OSError:
            log.warning("[spacy] modelo %s não instalado; usando pt_core_news_sm", nome)
            return spacy.load("pt_core_news_sm")

    # -- cache do índice ----------------------------------------------------------------------
    def recarregar(self):
        inicio = time.time()
        linhas = self._carregar_linhas()
        indice = IndiceSinais(linhas, self._sinonimos)
        if getattr(self, "semantica", None):
            self.semantica.atualizar(indice)
        self._indice = indice
        self._carregado_em = time.time()
        self.total_linhas = len(linhas)
        log.info("[cache] %d sinais (%d palavras/expressões) carregados em %.1fs",
                 len(linhas), len(indice.por_chave), time.time() - inicio)

    def pedir_recarga(self):
        """Recarrega os sinais do banco em segundo plano (usado depois de mudanças na administração).
        Se já houver uma recarga em andamento, faz mais uma ao terminar, para pegar a última mudança."""
        with self._lock:
            if self._atualizando.is_set():
                self._recarga_pendente = True
                return
            self._atualizando.set()
            self._recarga_pendente = False

        def tarefa():
            while True:
                self._recarregar_em_segundo_plano()
                with self._lock:
                    if not getattr(self, "_recarga_pendente", False):
                        return
                    self._recarga_pendente = False
                    self._atualizando.set()

        threading.Thread(target=tarefa, daemon=True).start()

    def status(self):
        return {
            "sinais": getattr(self, "total_linhas", 0),
            "palavras": len(self._indice.por_chave) if self._indice else 0,
            "carregado_em": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self._carregado_em)),
            "atualizando": self._atualizando.is_set(),
            "modelo_spacy": f"{self.nlp.meta.get('lang', '')}_{self.nlp.meta.get('name', '')}" if self.nlp else "",
            "busca_semantica": bool(self.semantica),
        }

    def _recarregar_em_segundo_plano(self):
        try:
            self.recarregar()
        except Exception:
            log.exception("[cache] erro ao atualizar, mantendo os dados atuais")
        finally:
            self._atualizando.clear()

    @property
    def indice(self):
        if time.time() - self._carregado_em > CACHE_TTL_SEGUNDOS and not self._atualizando.is_set():
            self._atualizando.set()
            threading.Thread(target=self._recarregar_em_segundo_plano, daemon=True).start()
        return self._indice

    def chaves_existentes(self):
        return self._indice.mapa_chaves()

    # -- análise da frase -----------------------------------------------------------------------
    def _pre_normalizar(self, frase):
        def trocar(m):
            palavra = m.group(0)
            ch = chave(palavra)
            if ch in self.abreviacoes:
                return self.abreviacoes[ch]
            return NUMEROS.get(palavra, palavra)
        return re.sub(r"\w+", trocar, frase)

    def analisar(self, frase):
        """Divide a frase em unidades (palavras ou expressões) já na ordem da glosa."""
        indice = self.indice
        texto = self._pre_normalizar(" ".join(frase.split()))
        pergunta = texto.strip().endswith("?")
        doc = self.nlp(texto)
        tokens = [t for t in doc if not t.is_space]
        palavras = [t for t in tokens if t.pos_ not in ("PUNCT", "SYM")]
        uma_palavra = len(palavras) == 1

        unidades = []
        i = 0
        while i < len(tokens):
            t = tokens[i]
            if t.pos_ in ("PUNCT", "SYM"):
                i += 1
                continue
            # Expressão composta mais longa que começa aqui
            achou = None
            for n in range(min(indice.max_palavras, len(tokens) - i), 1, -1):
                trecho = tokens[i:i + n]
                if any(x.pos_ in ("PUNCT", "SYM") for x in trecho):
                    continue
                if chave(" ".join(x.text for x in trecho)) in indice.compostas:
                    achou = trecho
                    break
            if achou:
                cabeca = next((x for x in achou if x.head not in achou or x.head == x), achou[0])
                texto_exp = " ".join(x.text for x in achou)
                unidades.append(Unidade(texto=texto_exp, forma=limpar(texto_exp), pos=cabeca.pos_, dep=cabeca.dep_,
                                        lema_spacy=texto_exp.lower(), composta=True, posicao=i,
                                        papel=self._papel(limpar(texto_exp), cabeca.pos_, cabeca.dep_)))
                i += len(achou)
                continue

            i += 1
            u = self._unidade_de_token(t, uma_palavra)
            if u:
                unidades.append(u)

        if uma_palavra or len(unidades) <= 1:
            return unidades
        return self._ordenar_glosa(unidades, pergunta)

    def _unidade_de_token(self, t, uma_palavra):
        texto = t.text
        forma = limpar(texto)
        if not forma:
            return None
        pos, dep, lema = t.pos_, t.dep_, (t.lemma_ or "").lower()
        # Nome próprio: escrito com maiúscula (fora do início da frase, ou que não é palavra do português).
        # A etiqueta PROPN do spaCy sozinha não basta: ele marca qualquer palavra desconhecida assim.
        maiuscula = texto[:1].isupper() and not (texto.isupper() and len(texto) > 1)
        nome_proprio = maiuscula and (t.i > 0 or not palavra_conhecida(forma))
        u = Unidade(texto=texto, forma=forma, pos=pos, dep=dep, lema_spacy=lema, nome_proprio=nome_proprio,
                    posicao=t.i)
        if uma_palavra:
            u.isolada = True
            u.pos = ""  # sem frase em volta, a classe gramatical do spaCy é um chute
            return u

        lemas = {lema, simplemma.lemmatize(forma, lang="pt").lower()}
        tipo_pron = t.morph.get("PronType")
        participio = bool(PARTICIPIO.search(forma))
        # "eu acordo cedo", "eu como frutas", "me ajuda": logo depois de pronome sujeito ou oblíquo
        # vem um verbo, mesmo quando o spaCy acha que é substantivo (acordo), advérbio (como) etc.
        anterior = t.nbor(-1) if t.i > 0 else None
        u.depois_de_pronome = (anterior is not None and anterior.pos_ == "PRON"
                               and chave(anterior.text) in PRONOMES_ANTES_DE_VERBO)
        if (u.depois_de_pronome and pos not in ("VERB", "AUX", "PRON", "CCONJ", "PUNCT")
                and chave(forma) not in NAO_VERBOS_APOS_PRONOME and not participio):
            infinitivo = infinitivo_provavel(forma)
            if infinitivo:
                u.pos = pos = "VERB"
                u.lema_spacy = lema = infinitivo
                u.verbo_forte = True
                lemas.add(infinitivo)
        elif (pos == "VERB" and not participio and lema != forma and lema == infinitivo_provavel(forma)
              and not (anterior is not None and chave(anterior.text) in ARTIGOS_E_POSSESSIVOS)):
            # spaCy e o dicionário concordam no infinitivo (bebe -> beber). Se discordam,
            # é melhor não confiar (o spaCy pequeno lê "lindo" como verbo "lir").
            # Depois de artigo/possessivo não vem verbo: "a porta" é a porta, não "portar".
            u.verbo_forte = True
        if forma in INTERROGATIVOS:
            u.papel = "outro"
            return u
        if pos == "DET" and (forma in ARTIGOS or "Art" in tipo_pron):
            return None
        if pos == "ADP" and forma not in PREPOSICOES_COM_SINAL:
            return None
        if pos == "CCONJ" and forma in CONJUNCOES_SEM_SINAL:
            return None
        if pos == "SCONJ" and forma in SUBORDINADAS_SEM_SINAL:
            return None
        if pos == "PRON" and forma == "que" and "Rel" in tipo_pron:
            return None
        if forma in PRONOMES_OBLIQUOS and pos in ("PRON", "AUX", "VERB", "NOUN"):
            u.forma = PRONOMES_OBLIQUOS[forma]
            u.lema_spacy = u.forma
            return u
        if pos == "PRON" and forma in PRONOMES_SEM_SINAL:
            return None
        # Verbos de ligação e auxiliares: em Libras normalmente não são sinalizados
        if lemas & VERBOS_DE_LIGACAO and pos in ("AUX", "VERB"):
            return None
        if pos == "AUX" and lemas & AUXILIARES_SEM_SINAL:
            return None
        if dep == "cop":
            return None

        u.papel = self._papel(forma, pos, dep)
        return u

    @staticmethod
    def _papel(forma, pos, dep):
        """Papel na glosa, que define a ordem: tempo, objeto, sujeito, outro, verbo."""
        if forma in TEMPO:
            return "tempo"
        if dep in ("nsubj", "nsubj:pass"):
            return "sujeito"
        if dep in ("obj", "iobj", "obl"):
            return "objeto"
        if pos in ("VERB", "AUX"):
            return "verbo"
        return "outro"

    @staticmethod
    def _ordenar_glosa(unidades, pergunta):
        # Ordem aproximada da Libras: [Tempo] + [Objeto/Tópico] + [Sujeito] + [Outros] + [Verbo] (+ [Pergunta])
        for u in unidades:
            if pergunta and chave(u.forma) in {chave(x) for x in INTERROGATIVOS}:
                u.papel = "pergunta"
        ordem = {"tempo": 0, "objeto": 1, "sujeito": 2, "outro": 3, "verbo": 4, "pergunta": 5}
        return sorted(unidades, key=lambda u: (ordem[u.papel], u.posicao))

    # -- busca de um termo ----------------------------------------------------------------------
    def _lemas(self, forma, pos, lema_spacy):
        """Lemas plausíveis. Para verbos vale o infinitivo; para o resto, só lemas que são plural,
        diminutivo ou aumentativo da palavra (evita conta -> contar e quarta -> quarto)."""
        candidatos = []
        # Gerúndio é sempre verbo, mesmo numa palavra solta ("chorando")
        verbo = pos in ("VERB", "AUX") or (not pos and forma.endswith(("ando", "endo", "indo")))
        lema_simplemma = simplemma.lemmatize(forma, lang="pt").lower()
        flexoes = None
        for lema in ((lema_spacy, lema_simplemma) if verbo else (lema_simplemma, lema_spacy)):
            if not lema or lema == forma or lema in candidatos or " " in lema:
                continue
            if verbo:
                if re.search(r"(ar|er|ir|or)$", lema):
                    candidatos.append(lema)
                continue
            if flexoes is None:
                flexoes = {tirar_acentos(v) for v in self._flexoes_sem_genero(forma)}
            if tirar_acentos(lema) in flexoes:
                candidatos.append(lema)
        return candidatos

    @staticmethod
    def _flexoes_sem_genero(forma, livre=False):
        """Plural -> singular, diminutivo e aumentativo (até 3 passos). Não troca o gênero."""
        regras_base = PLURAL + DIMINUTIVO_SEGURO + AUMENTATIVO_SEGURO + (AUMENTATIVO if livre else [])
        vistas, fila = [], [forma]
        for _ in range(3):
            proxima = []
            for f in fila:
                regras = regras_base + ([] if f in NAO_DIMINUTIVOS else DIMINUTIVO)
                minimo = 3 if f.endswith(("inho", "inha")) else 2
                for v in com_nasal(aplicar(f, regras, minimo)):
                    if v != forma and v not in vistas:
                        vistas.append(v)
                        proxima.append(v)
            fila = proxima
        return vistas

    @staticmethod
    def _pode_trocar_genero(base, candidato, pos, lemas):
        """Feminino -> masculino (linda -> lindo, médica -> médico) só quando é seguro:
        palavra real, fora de GENERO_MANTER (quarta, tia, conta...) e com um lematizador concordando."""
        if tirar_acentos(base) in GENERO_MANTER_SEM_ACENTO or not palavra_conhecida(base):
            return False
        if tirar_acentos(candidato) in lemas:
            return True
        # professora -> professor, diretora -> diretor: feminino de profissão, seguro para substantivos
        return base.endswith("ora") and pos in ("NOUN", "") and palavra_conhecida(candidato)

    def _variacoes(self, forma, pos, conhecida, lema_spacy=""):
        """Variações em ordem de confiança (só são usadas se existirem no banco)."""
        saida = []
        plurais = aplicar(forma, PLURAL)
        saida.extend(plurais)
        bases = [forma] + plurais
        lemas = {tirar_acentos(lema_spacy)} | {
            tirar_acentos(simplemma.lemmatize(b, lang="pt").lower()) for b in bases}
        for b in bases:
            saida.extend(com_nasal(aplicar(b, DIMINUTIVO_SEGURO + AUMENTATIVO_SEGURO)))
            for v in aplicar(b, GENERO):
                if self._pode_trocar_genero(b, v, pos, lemas):
                    saida.append(v)
            if b not in NAO_DIMINUTIVOS:
                saida.extend(com_nasal(aplicar(b, DIMINUTIVO, minimo=3)))
        if not conhecida:
            saida.extend(self._flexoes_sem_genero(forma, livre=True))
        if pos in ("VERB", "AUX") or not conhecida:
            saida.extend(aplicar(forma, VERBAL))
        vistas = []
        for v in saida:
            if v != forma and v not in vistas:
                vistas.append(v)
        return vistas

    def _buscar_forma(self, forma, pos, lema_spacy, permitido, conhecida, metodo_base=None,
                      verbo_primeiro=False):
        """Exato -> sinônimo -> lema -> variação. Devolve (Sinal, metodo) ou None.
        verbo_primeiro: a palavra é verbo nesta frase, então o infinitivo vem antes da forma exata
        ("eu gosto de café" -> GOSTAR, e não GOSTO/sabor; "ele bebe" -> BEBER, e não BEBÊ)."""
        idx = self._indice

        def tentar(f):
            s = idx.sinais(f, permitido)
            if s:
                return s, False
            destino = idx.sinonimo(f)
            if destino:
                s = idx.sinais(destino, permitido)
                if s:
                    return s, True
            return None

        lemas = self._lemas(forma, pos, lema_spacy)
        if verbo_primeiro:
            for lema in lemas:
                r = tentar(lema)
                if r:
                    return r[0], metodo_base or "lema"
        r = tentar(forma)
        if r:
            return r[0], metodo_base or ("sinonimo" if r[1] else "exato")
        for lema in lemas:
            r = tentar(lema)
            if r:
                return r[0], metodo_base or "lema"
        for v in self._variacoes(forma, pos, conhecida, lema_spacy):
            r = tentar(v)
            if r:
                return r[0], metodo_base or "variacao"
        return None

    def _buscar_verbo(self, forma, infinitivo, permitido):
        """Só o sinal do verbo: infinitivo (ou sinônimo dele) e terminações verbais."""
        idx = self._indice
        candidatos = [c for c in [infinitivo, infinitivo_provavel(forma)] if c]
        candidatos += [v for v in aplicar(forma, VERBAL) if palavra_conhecida(v)]
        if forma.endswith(("ar", "er", "ir")):
            candidatos.insert(0, forma)
        for c in dict.fromkeys(candidatos):
            s = idx.sinais(c, permitido)
            if s:
                return s, "lema" if c != forma else "exato"
            destino = idx.sinonimo(c)
            if destino:
                s = idx.sinais(destino, permitido)
                if s:
                    return s, "sinonimo"
        return None

    def _buscar(self, u, permitido):
        idx = self._indice
        forma = u.forma
        conhecida = palavra_conhecida(forma)

        if u.isolada and len(forma) == 1 and forma.isascii() and forma.isalpha():
            # Uma letra sozinha (ex.: clique em "A" no glossário): o sinal da letra.
            # "é" e "à" sozinhos são palavras, não letras.
            s = idx.letras.get(forma)
            return Achado(s, "exato") if s and permitido(s) else None

        if u.nome_proprio:
            # Nome próprio: só o próprio nome (ex.: cidade com sinal) ou um sinônimo; senão, soletra
            s = idx.sinais(forma, permitido)
            if not s and idx.sinonimo(forma):
                s = idx.sinais(idx.sinonimo(forma), permitido)
            return Achado(s, "exato") if s else None

        if u.verbo_forte:
            # É verbo com certeza: vale o sinal do verbo ou nada. A forma exata costuma ser
            # um substantivo homônimo (como, brinco, gosto, acordo, canto).
            r = self._buscar_verbo(forma, u.lema_spacy, permitido)
            return Achado(r[0], r[1]) if r else None

        verbo_primeiro = not u.isolada and u.pos == "VERB" and not PARTICIPIO.search(forma)
        r = self._buscar_forma(forma, u.pos, u.lema_spacy, permitido, conhecida, verbo_primeiro=verbo_primeiro)
        if r:
            return Achado(r[0], r[1])
        if u.composta:
            return None

        # Correção de digitação: só para o que NÃO é palavra do português
        if not conhecida:
            for f in formas_corrigidas(forma):
                if u.depois_de_pronome and infinitivo_provavel(f):  # "eu gostu de" -> gosto -> GOSTAR
                    r = self._buscar_verbo(f, infinitivo_provavel(f), permitido)
                    if r:
                        return Achado(r[0], "correcao", 0.9)
                # a classe gramatical de uma palavra digitada errado não é confiável: pos vazio
                r = self._buscar_forma(f, "", simplemma.lemmatize(f, lang="pt").lower(), permitido,
                                       palavra_conhecida(f), "correcao")
                if r:
                    return Achado(r[0], "correcao", 0.9)
            achado = self._corrigir_por_semelhanca_de_letras(forma, permitido)
            if achado:
                return achado

        # Semelhança de significado: só palavras reais de conteúdo, com limiar alto
        if self.semantica and conhecida and u.pos in ("NOUN", "VERB", "ADJ", "ADV") and len(forma) >= 3:
            consulta = u.lema_spacy if u.pos == "VERB" and u.lema_spacy else forma
            cands = self.semantica.candidatos(consulta, k=5)
            if cands and cands[0][1] >= self.limiar:
                segundo = cands[1][1] if len(cands) > 1 else 0.0
                if cands[0][1] - segundo >= MARGEM_SEMANTICA:
                    s = idx.sinais(cands[0][0], permitido)
                    if s:
                        return Achado(s, "semelhanca", cands[0][1], aproximado=True)
        return None

    def _corrigir_por_semelhanca_de_letras(self, forma, permitido):
        idx = self._indice
        p = tirar_acentos(forma)
        # 1. mesma "pronúncia" (carru ~ carro)
        cands = idx.por_fonetica.get(fonetica(p), [])
        if cands:
            dist = sorted((levenshtein(p, c), c) for c in cands)
            if len(dist) == 1 or dist[0][0] < dist[1][0]:
                s = idx.sinais(dist[0][1], permitido)
                if s:
                    return Achado(s, "correcao", 0.85)
        # 2. poucas letras de diferença, primeira letra igual e sem empate
        limite = limite_levenshtein(len(p))
        if not limite:
            return None
        melhores = []
        for c in idx.simples:
            if c[0] != p[0] or abs(len(c) - len(p)) > limite:
                continue
            d = levenshtein(p, c)
            if d <= limite:
                melhores.append((d, c))
        if not melhores:
            return None
        melhores.sort()
        if len(melhores) > 1 and melhores[0][0] == melhores[1][0]:
            return None  # empate: não dá para saber qual era a palavra
        s = idx.sinais(melhores[0][1], permitido)
        return Achado(s, "correcao", 0.8) if s else None

    def _soletrar(self, u):
        letras = tirar_acentos(u.forma).replace(" ", "")
        if not (2 <= len(letras) <= 15) or not letras.isalpha():
            return None
        sinais = [self._indice.letras.get(c) for c in letras]
        return sinais if all(sinais) else None

    # -- API pública ----------------------------------------------------------------------------
    def traduzir(self, frase, exclusoes=frozenset(), soletrar=None):
        """exclusoes: {(termo, expressao)} normalizados, que o usuário marcou como errados.

        soletrar: None (padrão, é o que o avaliador mede) soletra sozinho os nomes próprios sem sinal.
        Um conjunto de chaves (ver chave()) liga o modo "perguntar antes", usado pelo site: só as palavras
        do conjunto são soletradas. As outras sem sinal voltam em `sem_sinal` e, se der para soletrar,
        também em `soletraveis`, para o site oferecer a escolha entre ver o glossário e soletrar."""
        unidades = self.analisar(frase)
        sequencia, glosa, sem_sinal, soletraveis = [], [], [], []

        for u in unidades:
            termo = normalizar_sinal(u.texto)
            ocultos = {e for (t, e) in exclusoes if t == termo}

            def permitido(s, ocultos=ocultos):
                return not ocultos or normalizar_sinal(s.descricao) not in ocultos

            achado = self._buscar(u, permitido)
            if achado:
                sequencia.append({
                    "termo_original": u.texto.lower(),
                    "expressao_libras": achado.sinal.descricao,
                    "url": achado.sinal.url,
                    "score": round(achado.score, 4),
                    "metodo": achado.metodo,
                    "aproximado": achado.aproximado,
                })
                glosa.append(achado.sinal.descricao.lower())
                continue

            pedido = u.nome_proprio if soletrar is None else chave(u.texto) in soletrar
            letras = self._soletrar(u) if (self.datilologia and pedido) else None
            if letras:
                for s in letras:
                    sequencia.append({
                        "termo_original": u.texto.lower(),
                        "expressao_libras": s.descricao[-1].upper(),
                        "url": s.url,
                        "score": 1.0,
                        "metodo": "datilologia",
                        "aproximado": False,
                    })
                glosa.append(u.texto.upper())
            else:
                sem_sinal.append(u.texto.lower())
                glosa.append(u.forma)
                if (self.datilologia and u.texto.lower() not in soletraveis and not pedido
                        and self._soletrar(u)):
                    soletraveis.append(u.texto.lower())

        return {
            "frase_original": frase,
            "glosa_gerada": " ".join(glosa),
            "traducao_encontrada": bool(sequencia),
            "sequencia": sequencia,
            "sem_sinal": sem_sinal,
            "soletraveis": soletraveis,
        }
