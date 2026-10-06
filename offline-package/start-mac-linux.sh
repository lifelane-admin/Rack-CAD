#!/usr/bin/env bash
# RackSlicer Offline Server Launcher (macOS & Linux)

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "========================================================"
echo "   Launching RackSlicer Offline Server..."
echo "========================================================"
echo ""

if command -v node >/dev/null 2>&1; then
    echo "[Found Node.js] Launching with Node.js server..."
    node start-server.js
    exit 0
fi

if command -v python3 >/dev/null 2>&1; then
    echo "[Found Python 3] Launching with Python server..."
    python3 start-server.py
    exit 0
fi

if command -v python >/dev/null 2>&1; then
    echo "[Found Python] Launching with Python server..."
    python start-server.py
    exit 0
fi

echo "ERROR: Neither Node.js nor Python 3 was detected on this machine."
echo "Please install Node.js or Python 3 to run the local server."
read -p "Press Enter to exit..."
