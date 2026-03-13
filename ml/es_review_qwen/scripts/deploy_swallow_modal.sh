#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT/ml/es_review_qwen/.venv-serve}"
ADAPTER_REPO_ID="${ADAPTER_REPO_ID:-saoki0913/career-compass-qwen3-swallow-32b-es-review-lora}"
MODEL_NAME="${MODEL_NAME:-tokyotech-llm/Qwen3-Swallow-32B-SFT-v0.2}"
REASONING_PARSER="${REASONING_PARSER:-qwen3}"

source "$VENV_DIR/bin/activate"
python "$ROOT/ml/es_review_qwen/scripts/deploy_modal_service.py" \
  --adapter-repo-id "$ADAPTER_REPO_ID" \
  --model-name "$MODEL_NAME" \
  --reasoning-parser "$REASONING_PARSER"
