@echo off
echo Iniciando el chat...

echo Abriendo el servidor Backend...
start "Servidor Chat" cmd /k "cd server && node index.js"

echo Abriendo la Web UI...
start "Cliente Chat" cmd /k "cd client && npm run dev -- --host"

echo Todos los servicios estan iniciándose en ventanas separadas.
