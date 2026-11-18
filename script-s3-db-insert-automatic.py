"""
Cadastra no banco, sem revisão, os vídeos novos dos buckets S3.

O jeito recomendado agora é a tela Administração > Importar do S3 do site: ela mostra os vídeos
novos para aprovar um a um (ou todos), já com acento e embedding.

Para cada vídeo que ainda não está em animation_sl_br (comparando pela URL), cria a animação e
a palavra. A descrição vem do nome do arquivo: "Ano_Novo2.mp4" -> "ano novo".
Depois de rodar, rode também:
  python scripts/limpar_banco_sinais.py --aplicar   (recoloca acentos: "aviao" -> "avião")
  python gerador-embeddings-db.py                   (preenche a coluna embedding)
"""
import os

import boto3
import mysql.connector

from servico_admin import EXTENSOES_VIDEO, buckets_configurados, descricao_do_arquivo


def listar_e_inserir(bucket_name, region_name='us-east-1'):

    # ─────────────────────────────────────────────
    # Conectar ao S3
    # ─────────────────────────────────────────────

    s3 = boto3.client(
        's3',
        region_name=region_name
    )

    paginator = s3.get_paginator(
        'list_objects_v2'
    )

    page_iterator = paginator.paginate(
        Bucket=bucket_name
    )


    # ─────────────────────────────────────────────
    # Conectar ao MySQL
    # ─────────────────────────────────────────────

    conn = mysql.connector.connect(
        host=os.getenv('DB_HOST', 'db'),
        user=os.getenv('DB_USER', 'tradulibras'),
        password=os.getenv('DB_PASS', 'Tradulibras2024'),
        database=os.getenv('DB_NAME', 'app_tradu_embedding')
    )

    print("Conectado ao banco:", conn.is_connected())

    cursor = conn.cursor()


    total_novos = 0
    total_existentes = 0


    try:

        # ─────────────────────────────────────────
        # Percorrer arquivos do S3
        # ─────────────────────────────────────────

        for page in page_iterator:

            if 'Contents' not in page:
                continue


            for obj in page['Contents']:

                key = obj['Key']


                # Ignora "pastas" do S3 e arquivos que não são vídeo (logo, downloads incompletos)
                if key.endswith('/') or not key.lower().endswith(EXTENSOES_VIDEO):
                    continue


                url = (
                    f"https://{bucket_name}.s3."
                    f"{region_name}.amazonaws.com/{key}"
                )


                print(f"\nVerificando: {key}")


                # ─────────────────────────────────
                # Verifica se já existe
                # ─────────────────────────────────

                # Compara pela URL: comparar o nome do arquivo com a descrição
                # (como era antes) duplicava todos os vídeos já cadastrados.
                cursor.execute(
                    """
                    SELECT id_animation
                    FROM animation_sl_br
                    WHERE url = %s
                    LIMIT 1
                    """,
                    (url,)
                )

                existente = cursor.fetchone()


                if existente:

                    print(
                        f"⏭️ Já existe no banco. "
                        f"Ignorando: {key}"
                    )

                    total_existentes += 1

                    continue


                # ─────────────────────────────────
                # Novo registro
                # ─────────────────────────────────

                if not descricao_do_arquivo(key):
                    print(f"⚠️ Nome de arquivo sem palavra, cadastre à mão: {key}")
                    continue

                print(
                    f"🆕 Novo vídeo encontrado: {key}"
                )


                # Insere a animação
                cursor.execute(
                    """
                    INSERT INTO animation_sl_br (url)
                    VALUES (%s)
                    """,
                    (url,)
                )


                id_animation = cursor.lastrowid


                print(
                    f"   id_animation: {id_animation}"
                )


                # Insere a palavra
                cursor.execute(
                    """
                    INSERT INTO words_sl_br
                    (
                        id_animation,
                        description,
                        embedding
                    )
                    VALUES (%s, %s, %s)
                    """,
                    (
                        id_animation,
                        descricao_do_arquivo(key),
                        None
                    )
                )


                total_novos += 1


                print(
                    f"   ✅ Inserido: {key}"
                )


        # ─────────────────────────────────────────
        # Salva alterações
        # ─────────────────────────────────────────

        conn.commit()


        print("\n====================================")
        print("Processamento concluído!")
        print(f"🆕 Novos inseridos: {total_novos}")
        print(f"⏭️ Já existentes: {total_existentes}")
        print("====================================")


    except Exception as e:

        conn.rollback()

        print(
            f"\n❌ Erro ao inserir: {e}"
        )


    finally:

        cursor.close()
        conn.close()


if __name__ == "__main__":

    # Os vídeos estão em dois buckets (words-traducao e tradulibras-videos); S3_BUCKETS no .env troca a lista
    for bucket in buckets_configurados():
        listar_e_inserir(bucket)