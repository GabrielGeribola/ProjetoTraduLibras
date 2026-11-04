import boto3
import mysql.connector


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
        host='db',
        user='tradulibras',
        password='Tradulibras2024',
        database='app_tradu_embedding'
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


                # Ignora possíveis "pastas" do S3
                if key.endswith('/'):
                    continue


                url = (
                    f"https://{bucket_name}.s3."
                    f"{region_name}.amazonaws.com/{key}"
                )


                print(f"\nVerificando: {key}")


                # ─────────────────────────────────
                # Verifica se já existe
                # ─────────────────────────────────

                cursor.execute(
                    """
                    SELECT id_word
                    FROM words_sl_br
                    WHERE description = %s
                    LIMIT 1
                    """,
                    (key,)
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
                        key,
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

    listar_e_inserir(
        "words-traducao"
    )