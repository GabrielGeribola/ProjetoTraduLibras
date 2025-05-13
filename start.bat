@echo off
cd /d %~dp0

IF NOT EXIST "venv\Scripts\activate.bat" (
    echo 🛠 Criando ambiente virtual (venv)...
    python -m venv venv
)


echo 🔧 Ativando ambiente virtual...
call venv\Scripts\activate.bat


echo 📦 Instalando dependências...
pip install -r requirements_api.txt >nul 2>&1


echo 🚀 Iniciando API Flask...
start cmd /k "call venv\Scripts\activate.bat && python ApiTradu.py"


echo 🌐 Iniciando front-end Node.js...
start cmd /k "npm run dev"
