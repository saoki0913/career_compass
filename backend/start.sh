#!/bin/bash
# Backend startup script with virtual environment activation

cd "$(dirname "$0")"
source .venv/bin/activate
echo "Virtual environment activated: $(which python)"
uvicorn app.main:app --reload --port 8000
