"""
Funções usadas pela área de administração do site (chamadas pelo servidor Node, nunca pelo navegador):
listar os vídeos do S3, sugerir a descrição a partir do nome do arquivo e gerar a coluna `embedding`.

Também usadas pelos scripts script-s3-db-insert-automatic.py e scripts/limpar_banco_sinais.py.
"""
import os
import re
import threading
import unicodedata

EXTENSOES_VIDEO = (".mp4", ".webm", ".mov")
# Buckets com vídeos de sinais (as URLs do banco usam os dois). Pode ser trocado por S3_BUCKETS no .env.
BUCKETS_PADRAO = ("words-traducao", "tradulibras-videos")
# Modelo da coluna words_sl_br.embedding (o mesmo usado desde a primeira versão da API)
MODELO_EMBEDDING_BANCO = "paraphrase-MiniLM-L6-v2"
NAO_ACENTUAR = {"basquete", "coreia"}  # o dicionário sugere grafias erradas/antigas (básquete, coréia)


def tirar_acentos(texto):
    texto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in texto if not unicodedata.combining(c))


def descricao_do_arquivo(key):
    """'pasta/Ano_Novo2.mp4' -> 'ano novo'"""
    nome = os.path.splitext(key.rsplit("/", 1)[-1])[0]
    nome = re.sub(r"\(\d*\)|\d+$", " ", nome)   # "Palmada (1)", "amor1"
    nome = nome.replace("_", " ")
    return " ".join(nome.split()).lower()


def montar_acentuador():
    """Devolve uma função que recoloca acentos numa palavra sem acento, quando não há dúvida."""
    from simplemma.strategies.dictionaries import DefaultDictionaryFactory
    dicionario = DefaultDictionaryFactory().get_dictionary("pt")
    exatas = set()
    acentuadas = {}
    for k in dicionario.keys():
        if not k.isalpha():
            continue
        k = k.lower()
        exatas.add(k)
        sem = tirar_acentos(k)
        if sem != k:
            acentuadas.setdefault(sem, set()).add(k)

    def acentuar(palavra):
        if not palavra.isalpha() or palavra in exatas or palavra in NAO_ACENTUAR:
            return palavra  # não é palavra simples, ou já existe assim (maca, pais, agua, abençoar)
        opcoes = acentuadas.get(tirar_acentos(palavra), set())  # "aboliçao" também procura "abolição"
        if len(opcoes) != 1:
            return palavra
        # O dicionário mistura grafias de Portugal: abdómen/ténis -> abdômen/tênis (Brasil).
        # "também", "alguém" (acento no fim) continuam iguais.
        return re.sub(r"[éó](?=[mn][aeiouáéíóú])", lambda m: {"é": "ê", "ó": "ô"}[m.group(0)], next(iter(opcoes)))
    return acentuar


_acentuar = None
_acentuar_lock = threading.Lock()


def acentuar_texto(texto):
    """'aviao de papel' -> 'avião de papel' (só quando não há dúvida)."""
    global _acentuar
    with _acentuar_lock:
        if _acentuar is None:
            _acentuar = montar_acentuador()
    return re.sub(r"[^\W\d_]+", lambda m: _acentuar(m.group(0)), texto)


def sugerir_descricao(key):
    return acentuar_texto(descricao_do_arquivo(key))


def buckets_configurados():
    valor = os.getenv("S3_BUCKETS", "")
    buckets = [b.strip() for b in valor.split(",") if b.strip()]
    return buckets or list(BUCKETS_PADRAO)


def url_do_objeto(bucket, regiao, key):
    # Mesmo formato das URLs que já estão no banco (sem codificar espaços: "A VISTA.mp4")
    return f"https://{bucket}.s3.{regiao}.amazonaws.com/{key}"


def listar_videos_s3(buckets=None, regiao=None):
    """Lista os vídeos de cada bucket. Precisa de credenciais da AWS com permissão s3:ListBucket
    (variáveis AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, ~/.aws/credentials ou papel IAM do servidor)."""
    import boto3

    regiao = regiao or os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    s3 = boto3.client("s3", region_name=regiao)
    videos, ignorados = [], 0
    for bucket in buckets or buckets_configurados():
        for pagina in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
            for obj in pagina.get("Contents", []):
                key = obj["Key"]
                if key.endswith("/") or not key.lower().endswith(EXTENSOES_VIDEO):
                    ignorados += 1  # "pastas", imagens, downloads incompletos
                    continue
                videos.append({
                    "bucket": bucket,
                    "chave": key,
                    "url": url_do_objeto(bucket, regiao, key),
                    "tamanho": obj.get("Size"),
                    "modificado_em": obj["LastModified"].strftime("%Y-%m-%d %H:%M:%S") if obj.get("LastModified") else None,
                    "descricao_sugerida": sugerir_descricao(key),
                })
    return {"buckets": list(buckets or buckets_configurados()), "videos": videos, "ignorados": ignorados}


_modelo = None
_modelo_lock = threading.Lock()


def gerar_embeddings(textos):
    """Vetores da coluna words_sl_br.embedding. O modelo (~90 MB) só é carregado no primeiro uso."""
    global _modelo
    with _modelo_lock:
        if _modelo is None:
            from sentence_transformers import SentenceTransformer
            _modelo = SentenceTransformer(MODELO_EMBEDDING_BANCO)
        vetores = _modelo.encode(list(textos), batch_size=64, show_progress_bar=False)
    return [v.tolist() for v in vetores]


def modelo_embedding_carregado():
    return _modelo is not None
