#!/bin/bash

cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "🛠 Criando ambiente virtual (venv)..."
  python3 -m venv venv
fi

echo "🔧 Ativando ambiente virtual Python..."
source venv/bin/activate

echo "📦 Verificando dependências..."
pip install -r requirements_api.txt --quiet

echo "🚀 Iniciando API Flask..."
python3 ApiTradu.py &

echo "🌐 Iniciando front-end Node.js..."
npm run dev
