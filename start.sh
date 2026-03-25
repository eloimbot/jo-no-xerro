#!/bin/bash

echo "Iniciando el servidor Backend..."
cd server
node index.js &
SERVER_PID=$!

echo "Iniciando el cliente Web UI..."
cd ../client
npm run dev -- --host &
CLIENT_PID=$!

echo "Todos los servicios están en ejecución."
echo "Para detenerlos, presiona Ctrl+C."

# Mantener el script corriendo y esperar a que los procesos terminen
wait $SERVER_PID
wait $CLIENT_PID
