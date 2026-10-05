#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo "  Gemini Managed Agents Studio"
echo "  Google Cloud Agent Platform & Antigravity Harness"
echo "======================================================="

# Verify venv exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    /opt/homebrew/bin/python3 -m venv .venv
    ./.venv/bin/pip install -r requirements.txt
fi

echo "Starting Web Server on http://localhost:8000..."
./.venv/bin/python app.py
