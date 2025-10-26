import boto3
import mysql.connector

def listar_e_inserir(bucket_name, region_name='us-east-1'):
    # Conectar no S3
    s3 = boto3.client('s3', region_name=region_name)
    paginator = s3.get_paginator('list_objects_v2')
    page_iterator = paginator.paginate(Bucket=bucket_name)

    # Conectar no MySQL
    conn = mysql.connector.connect(
       host='db-tradulibras.crywgwekuqzx.us-east-1.rds.amazonaws.com',
      user='tradulibras ',
      password='Tradulibras2024',
      database='app_tradu_embedding' 
    )
    print("Conectado ao banco:", conn.is_connected())
    cursor = conn.cursor()

    total = 0

    try:
        for page in page_iterator:
            if 'Contents' in page:
                for obj in page['Contents']:
                    key = obj['Key']
                    url = f"https://{bucket_name}.s3.{region_name}.amazonaws.com/{key}"
                    print(f"Inserindo URL: {url}")

                    cursor.execute("INSERT INTO animation_sl_br (url) VALUES (%s)", (url,))
                    id_animation = cursor.lastrowid
                    print(f"id_animation: {id_animation}")

                    cursor.execute("""
                        INSERT INTO words_sl_br (id_animation, description, embedding)
                        VALUES (%s, %s, %s)
                    """, (id_animation, key, None))

                    total += 1

        conn.commit()
        print(f"Total inseridos: {total}")
    except Exception as e:
        conn.rollback()
        print("Erro ao inserir:", e)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    listar_e_inserir("words-traducao")
