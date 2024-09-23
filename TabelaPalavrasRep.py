import pandas as pd

df = pd.read_csv('palavras.csv')
df_unique = df.drop_duplicates(subset=['palavra'])
df_unique.to_csv('palavras_unicas.csv', index=False)

print("Tabela sem palavras repetidas criada com sucesso!")
