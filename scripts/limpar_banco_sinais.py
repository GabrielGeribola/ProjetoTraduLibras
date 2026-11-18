"""
Limpeza das tabelas de sinais (words_sl_br / animation_sl_br).

O que faz:
  1. Apaga as linhas cuja descrição é um nome de arquivo ("amor1.mp4"). Foram criadas pelo
     script-s3-db-insert-automatic.py antigo e todas apontam para vídeos que já têm uma linha limpa.
  2. Apaga registros que não são sinais (imagem do logo, vídeo de apresentação, download incompleto).
  3. Padroniza as descrições: minúsculas, sem espaços sobrando, "_" vira espaço, sem "()",
     erros de digitação conhecidos corrigidos e acentos recolocados quando não há dúvida
     ("voce" -> "você", "cafe" -> "café"; "maca" fica como está porque também é palavra).
  4. Recalcula a coluna `embedding` (modelo antigo) das linhas alteradas, para manter compatível
     quem ainda usa a versão antiga da API.

Vídeos diferentes da mesma palavra ("ABACAXI.mp4" e "Abacaxi.mp4") são mantidos: são gravações
diferentes e o tradutor usa a primeira; as outras servem de alternativa.

Uso (na raiz do projeto, com a venv ativada):
  python scripts/limpar_banco_sinais.py              # só mostra o que faria (simulação)
  python scripts/limpar_banco_sinais.py --aplicar    # aplica (faça backup antes!)
"""
import argparse
import json
import os
import re
import sys
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))

ARQUIVO = re.compile(r"\.(mp4|webm|gif|mov|png|jpe?g)$", re.I)
# Registros que não são sinais (comparação pela URL, que é única)
NAO_SAO_SINAIS = re.compile(r"(tradulibras\.png|/Tradulibras\.png|Dicionario Libras\.mp4|\.crdownload)$", re.I)
CORRECOES = {
    "frentea frente": "frente a frente",
    "gravacao de fita casssete": "gravação de fita cassete",
    "batida ritimo": "batida ritmo",
    "lento, varagoso": "lento, vagaroso",
    "lestra a": "letra a",
    "licensa, pretexto": "licença, pretexto",
    "maquina-de escrever": "máquina de escrever",
    "cafe-da-manha": "café da manhã",
}
NAO_ACENTUAR = {"basquete", "coreia"}  # o dicionário sugere grafias erradas/antigas (básquete, coréia)


def tirar_acentos(texto):
    texto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in texto if not unicodedata.combining(c))


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


def nova_descricao(descricao, acentuar):
    d = re.sub(r"\(\s*\)", " ", descricao)
    d = d.replace("_", " ")
    d = " ".join(d.split()).lower()
    d = CORRECOES.get(d, d)
    # acentua palavra por palavra, preservando hífens e vírgulas
    return re.sub(r"[^\W\d_]+", lambda m: acentuar(m.group(0)), d)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--aplicar", action="store_true", help="grava as mudanças no banco")
    p.add_argument("--relatorio", default="limpeza_sinais_relatorio.json", help="arquivo com a lista de mudanças")
    args = p.parse_args()

    from avaliar_traducao import carregar_env
    carregar_env()
    import mysql.connector
    db = mysql.connector.connect(host=os.environ["DB_HOST"], user=os.environ["DB_USER"],
                                 password=os.environ["DB_PASS"], database=os.environ["DB_NAME"])
    cur = db.cursor()
    cur.execute("""SELECT w.id_word, w.description, w.id_animation, a.url
                   FROM words_sl_br w JOIN animation_sl_br a ON a.id_animation = w.id_animation
                   ORDER BY w.id_word""")
    linhas = cur.fetchall()
    cur.execute("SELECT id_animation, COUNT(*) FROM words_sl_br GROUP BY id_animation")
    usos_animacao = dict(cur.fetchall())

    urls_limpas = {url for _, d, _, url in linhas if not ARQUIVO.search(d.strip())}
    apagar = []
    for id_word, desc, id_anim, url in linhas:
        if NAO_SAO_SINAIS.search(url):
            apagar.append((id_word, id_anim, desc, "não é sinal"))
        elif ARQUIVO.search(desc.strip()):
            if url not in urls_limpas:
                print(f"  AVISO: {desc!r} tem vídeo sem outra linha; não será apagado")
                continue
            apagar.append((id_word, id_anim, desc, "nome de arquivo, vídeo já cadastrado"))
    ids_apagar = {a[0] for a in apagar}

    print("Montando o dicionário de acentos...")
    acentuar = montar_acentuador()
    renomear = []
    for id_word, desc, _, _ in linhas:
        if id_word in ids_apagar:
            continue
        nova = nova_descricao(desc, acentuar)
        if nova != desc:
            renomear.append((id_word, desc, nova))

    so_formato = sum(1 for _, a, n in renomear if " ".join(a.replace("_", " ").split()).lower() == n)
    acentos = [(a, n) for _, a, n in renomear if tirar_acentos(n) != n and tirar_acentos(n) == tirar_acentos(" ".join(a.replace("_", " ").split()).lower())]
    print(f"\nLinhas no banco: {len(linhas)}")
    print(f"Apagar: {len(apagar)} ({sum(1 for a in apagar if a[3] == 'não é sinal')} que não são sinais)")
    print(f"Renomear: {len(renomear)} (só maiúsculas/espaços/sublinhado: {so_formato}; com acento recolocado: {len(acentos)})")
    print("Exemplos de acento recolocado:", ", ".join(f"{a}→{n}" for a, n in acentos[:40]))
    print("Não são sinais:", [a[2] for a in apagar if a[3] == "não é sinal"])

    with open(args.relatorio, "w", encoding="utf-8") as f:
        json.dump({"apagar": [{"id_word": a[0], "descricao": a[2], "motivo": a[3]} for a in apagar],
                   "renomear": [{"id_word": i, "de": a, "para": n} for i, a, n in renomear]},
                  f, ensure_ascii=False, indent=1)
    print(f"Lista completa em {args.relatorio}")

    if not args.aplicar:
        print("\nSimulação: nada foi alterado. Rode com --aplicar para gravar.")
        return

    # A coluna antiga `embedding` acompanha a nova descrição (compatível com a versão antiga da API).
    # Calculada antes de gravar, para o banco ficar o menor tempo possível com mudanças pela metade.
    print("\nCalculando embeddings das descrições novas...")
    from sentence_transformers import SentenceTransformer
    modelo = SentenceTransformer("paraphrase-MiniLM-L6-v2")
    vetores = modelo.encode([n for _, _, n in renomear], batch_size=128, show_progress_bar=False)

    # Tudo em lotes: banco remoto + milhares de comandos um a um derrubava a conexão.
    # Cada lote é gravado na hora; se cair no meio, é só rodar de novo (o script recalcula tudo).
    print("Aplicando...")
    lote = 500
    ids_palavras = [a[0] for a in apagar]
    ids_animacoes = [a[1] for a in apagar if usos_animacao.get(a[1], 0) <= 1]
    for i in range(0, len(ids_palavras), lote):
        parte = ids_palavras[i:i + lote]
        cur.execute(f"DELETE FROM words_sl_br WHERE id_word IN ({','.join(['%s'] * len(parte))})", parte)
        db.commit()
    for i in range(0, len(ids_animacoes), lote):
        parte = ids_animacoes[i:i + lote]
        cur.execute(f"DELETE FROM animation_sl_br WHERE id_animation IN ({','.join(['%s'] * len(parte))})", parte)
        db.commit()
    print(f"  {len(ids_palavras)} palavras e {len(ids_animacoes)} animações apagadas")

    cur.execute("""CREATE TEMPORARY TABLE tmp_renomear (
                       id_word INT PRIMARY KEY, description VARCHAR(100) NOT NULL, embedding JSON NOT NULL)""")
    dados = [(id_word, nova, json.dumps(v.tolist())) for (id_word, _, nova), v in zip(renomear, vetores)]
    for i in range(0, len(dados), lote):
        cur.executemany("INSERT INTO tmp_renomear (id_word, description, embedding) VALUES (%s, %s, %s)",
                        dados[i:i + lote])
    cur.execute("""UPDATE words_sl_br w JOIN tmp_renomear t ON t.id_word = w.id_word
                   SET w.description = t.description, w.embedding = t.embedding""")
    db.commit()
    print(f"  {cur.rowcount} descrições atualizadas")

    cur.execute("SELECT COUNT(*) FROM words_sl_br WHERE embedding IS NULL")
    print(f"  linhas sem embedding: {cur.fetchone()[0]}")
    db.close()


if __name__ == "__main__":
    main()
