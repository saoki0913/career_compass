#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT/ml/es_review_qwen/.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

echo "[bootstrap] repo root: $ROOT"
echo "[bootstrap] venv dir: $VENV_DIR"

"$PYTHON_BIN" -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip setuptools wheel
python -m pip install -r "$ROOT/ml/es_review_qwen/requirements-train.txt"
python "$ROOT/ml/es_review_qwen/scripts/preflight_swallow_32b.py" --check-imports
