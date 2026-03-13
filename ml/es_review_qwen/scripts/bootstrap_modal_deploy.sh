#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT/ml/es_review_qwen/.venv-serve}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[bootstrap-serve] repo root: $ROOT"
echo "[bootstrap-serve] venv dir: $VENV_DIR"

"$PYTHON_BIN" -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip setuptools wheel
python -m pip install -r "$ROOT/ml/es_review_qwen/requirements-serve.txt"
