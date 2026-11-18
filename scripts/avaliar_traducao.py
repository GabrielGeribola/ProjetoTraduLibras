"""
Mede a qualidade da tradução Português -> Libras.

Roda dois conjuntos de teste e mostra quantos sinais saíram certos, errados ou faltando:
  1. frases de scripts/casos_teste_traducao.json (frases com o resultado esperado);
  2. palavras da tabela validation_metrics (testes antigos da equipe, muitos com erro de digitação).

O número mais importante é "sinais errados": um sinal errado confunde quem está aprendendo;
"sem sinal" é preferível a um sinal errado.

Uso (na raiz do projeto, com a venv ativada):
  python scripts/avaliar_traducao.py                 # motor atual (tradutor.py)
  python scripts/avaliar_traducao.py --detalhes      # lista cada erro
  python scripts/avaliar_traducao.py --motor-antigo caminho/para/ApiTradu_antigo.py
  python scripts/avaliar_traducao.py --saida resultado.json

As variáveis DB_* são lidas do ambiente ou do arquivo .env.
"""
import argparse
import collections
import importlib.util
import json
import os
import re
import sys
import time
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)


def carregar_env():
    caminho = os.path.join(RAIZ, ".env")
    if not os.path.exists(caminho):
        return
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            nome, valor = linha.split("=", 1)
            os.environ.setdefault(nome.strip(), valor.strip().strip('"'))


def chave(texto):
    """Forma de comparação: minúsculas, sem acento, sem pontuação."""
    texto = unicodedata.normalize("NFKD", (texto or "").lower())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[-_]", " ", texto)
    texto = re.sub(r"[^a-z0-9 ]", "", texto)
    return " ".join(texto.split())


def agrupar_sequencia(sequencia):
    """Converte a sequência da API em lista de chaves; letras soletradas viram '#palavra'."""
    saida = []
    soletrando = None
    for item in sequencia:
        if item.get("metodo") == "datilologia":
            termo = chave(item.get("termo_original"))
            if soletrando and soletrando[0] == termo:
                continue
            soletrando = (termo,)
            saida.append(("#" + termo, item))
        else:
            soletrando = None
            saida.append((chave(item.get("expressao_libras")), item))
    return saida


def comparar(obtidos, esperados):
    """Casa cada sinal obtido com um esperado. Retorna (certos, errados, faltando, soletrados_extra)."""
    restantes = [set(chave(a) if not a.startswith("#") else "#" + chave(a[1:]) for a in e.split("|"))
                 for e in esperados]
    certos, errados, extras = [], [], []
    for k, item in obtidos:
        achou = next((i for i, alts in enumerate(restantes) if k in alts), None)
        if achou is not None:
            certos.append(k)
            restantes.pop(achou)
        elif k.startswith("#"):
            extras.append(k)
        else:
            errados.append((k, item))
    faltando = ["|".join(sorted(alts)) for alts in restantes]
    return certos, errados, faltando, extras


def motor_novo(args):
    import tradutor
    motor = tradutor.Tradutor.criar_do_ambiente(
        modelo_spacy=args.spacy, modelo_embedding=args.embedding, limiar_semantico=args.limiar)
    return lambda frase: motor.traduzir(frase)["sequencia"], motor.chaves_existentes()


def motor_antigo(caminho):
    spec = importlib.util.spec_from_file_location("api_antiga", caminho)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    expressions, _, _ = mod.obter_cache_sinais()
    return lambda frase: mod.processar_traducao_frase(frase)["sequencia"], {chave(e): chave(e) for e in expressions}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--motor-antigo", help="caminho de uma versão antiga do ApiTradu.py para comparar")
    p.add_argument("--spacy", help="modelo spaCy (padrão: o do tradutor)")
    p.add_argument("--embedding", help="modelo de embeddings (padrão: o do tradutor); 'nenhum' desliga")
    p.add_argument("--limiar", type=float, help="limiar da busca por semelhança")
    p.add_argument("--detalhes", action="store_true", help="lista cada caso com problema")
    p.add_argument("--saida", help="grava o resultado completo em JSON")
    args = p.parse_args()

    carregar_env()
    inicio = time.time()
    traduzir, chaves_banco = motor_antigo(args.motor_antigo) if args.motor_antigo else motor_novo(args)
    print(f"Motor carregado em {time.time() - inicio:.0f}s")

    with open(os.path.join(RAIZ, "scripts", "casos_teste_traducao.json"), encoding="utf-8") as f:
        casos = json.load(f)
    conjuntos = [("FRASES DE AJUSTE", "frases", casos["frases"]),
                 ("FRASES DE CONTROLE 1", "controle", casos.get("frases_controle", [])),
                 ("FRASES DE CONTROLE 2 (nunca usadas para ajustar)", "controle_2",
                  casos.get("frases_controle_2", []))]

    # Palavras da validation_metrics (sem repetição). Se o esperado não existe no banco,
    # o correto é não mostrar sinal nenhum.
    import mysql.connector
    db = mysql.connector.connect(host=os.environ["DB_HOST"], user=os.environ["DB_USER"],
                                 password=os.environ["DB_PASS"], database=os.environ["DB_NAME"])
    cur = db.cursor()
    cur.execute("SELECT input_text, expected_output FROM validation_metrics ORDER BY id")
    palavras = list(dict.fromkeys((e.strip(), s.strip()) for e, s in cur.fetchall()))
    db.close()

    # Avisa quando um sinal esperado nem existe no banco (erro no caso de teste, não no tradutor)
    for _, _, lista in conjuntos:
        for caso in lista:
            for item in caso["esperado"]:
                alternativas = [a for a in item.split("|") if not a.startswith("#")]
                if alternativas and not any(chave(a) in chaves_banco for a in alternativas):
                    print(f"  AVISO: caso {caso['frase']!r} espera {item!r}, que não existe no banco")

    resultado = {"frases": [], "controle": [], "controle_2": [], "palavras": []}
    tot = collections.Counter()
    t0 = time.time()
    total_casos = 0

    for _, nome, lista in conjuntos:
        for caso in lista:
            total_casos += 1
            obtidos = agrupar_sequencia(traduzir(caso["frase"]))
            certos, errados, faltando, extras = comparar(obtidos, caso["esperado"])
            tot[nome + "_sinais_esperados"] += len(caso["esperado"])
            tot[nome + "_certos"] += len(certos)
            tot[nome + "_errados"] += len(errados)
            tot[nome + "_faltando"] += len(faltando)
            tot[nome + "_soletrados_extra"] += len(extras)
            tot[nome + "_perfeitas"] += int(not errados and not faltando)
            resultado[nome].append({
                "frase": caso["frase"], "esperado": caso["esperado"],
                "obtido": [k for k, _ in obtidos],
                "errados": [{"sinal": k, "termo": it.get("termo_original"), "metodo": it.get("metodo")}
                            for k, it in errados],
                "faltando": faltando, "soletrados_extra": extras,
            })

    for entrada, esperado in palavras:
        alvo = chaves_banco.get(chave(esperado))  # considera sinônimos cadastrados (trabalho -> emprego trabalho)
        obtidos = agrupar_sequencia(traduzir(entrada))
        sinais = [k for k, _ in obtidos if not k.startswith("#")]
        soletrado = any(k.startswith("#") for k, _ in obtidos)
        palavras_entrada = set(chave(entrada).split())
        if alvo and alvo in sinais and len(sinais) == 1:
            situacao = "certo"
        elif sinais and alvo is None and len(palavras_entrada) > 1 and set(sinais) <= palavras_entrada:
            situacao = "parcial"  # ex.: "bom dia" sem sinal de "bom" -> só DIA (incompleto, mas não errado)
        elif sinais:
            situacao = "errado"
        elif alvo is None:
            situacao = "certo_sem_sinal"  # não existe sinal; não mostrar nada é o correto
        else:
            situacao = "soletrado" if soletrado else "sem_sinal"
        tot["palavra_" + situacao] += 1
        resultado["palavras"].append({"entrada": entrada, "esperado": esperado, "existe_no_banco": alvo is not None,
                                      "obtido": [k for k, _ in obtidos],
                                      "metodos": [it.get("metodo") for _, it in obtidos], "situacao": situacao})

    tempo_medio = (time.time() - t0) / (total_casos + len(palavras)) * 1000
    for titulo, nome, lista in conjuntos:
        if not lista:
            continue
        devolvidos = tot[nome + "_certos"] + tot[nome + "_errados"]
        print(f"\n=== {titulo} ({len(lista)} casos, {tot[nome + '_sinais_esperados']} sinais esperados)")
        print(f"  sinais certos ........ {tot[nome + '_certos']}")
        print(f"  sinais ERRADOS ....... {tot[nome + '_errados']}")
        print(f"  sinais faltando ...... {tot[nome + '_faltando']}")
        print(f"  soletrados a mais .... {tot[nome + '_soletrados_extra']}")
        print(f"  frases perfeitas ..... {tot[nome + '_perfeitas']}/{len(lista)}")
        if devolvidos:
            print(f"  precisão (certos/devolvidos) .. {tot[nome + '_certos'] / devolvidos:.1%}")
        print(f"  cobertura (certos/esperados) .. {tot[nome + '_certos'] / tot[nome + '_sinais_esperados']:.1%}")

    print(f"\n=== PALAVRAS da validation_metrics ({len(palavras)} sem repetição)")
    for s in ["certo", "certo_sem_sinal", "parcial", "errado", "sem_sinal", "soletrado"]:
        print(f"  {s:.<22} {tot['palavra_' + s]}")
    acertos = tot["palavra_certo"] + tot["palavra_certo_sem_sinal"] + tot["palavra_parcial"]
    print(f"  acerto total ......... {acertos / len(palavras):.1%}")
    print(f"\nTempo médio por tradução: {tempo_medio:.0f} ms")

    if args.detalhes:
        print("\n--- Frases com problema")
        for r in resultado["frases"] + resultado["controle"] + resultado["controle_2"]:
            if r["errados"] or r["faltando"]:
                errados = ", ".join(f"{e['sinal']} (de '{e['termo']}', {e['metodo']})" for e in r["errados"])
                print(f"  {r['frase']!r}: obtido={r['obtido']}"
                      + (f" | ERRADOS: {errados}" if errados else "")
                      + (f" | faltando: {r['faltando']}" if r["faltando"] else ""))
        print("\n--- Palavras erradas")
        for r in resultado["palavras"]:
            if r["situacao"] == "errado":
                print(f"  {r['entrada']!r} -> {r['obtido']} {r['metodos']} (esperado {r['esperado']!r}"
                      f"{'' if r['existe_no_banco'] else ', que não existe no banco'})")
        print("\n--- Palavras sem sinal (o esperado existe no banco)")
        print("  " + ", ".join(f"{r['entrada']}→{r['esperado']}" for r in resultado["palavras"]
                               if r["situacao"] in ("sem_sinal", "soletrado")))

    if args.saida:
        resultado["totais"] = dict(tot)
        with open(args.saida, "w", encoding="utf-8") as f:
            json.dump(resultado, f, ensure_ascii=False, indent=1)
        print(f"\nResultado completo em {args.saida}")


if __name__ == "__main__":
    main()
