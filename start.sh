#!/bin/bash

cleanup() {
    echo "Stopping services..."
    kill "$BACKEND_PID" 2>/dev/null
    wait "$BACKEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "[FORECAST] Starting Python backend..."
python3 forecast-service/main.py &
BACKEND_PID=$!

echo "[VITE] Starting frontend..."
./node_modules/.bin/vite
