#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT/ml/es_review_qwen/.venv}"
SOURCE_DIR="${1:-$ROOT/ml/es_review_qwen/outputs/qwen3-swallow-32b-es-review-lora}"
REPO_ID="${REPO_ID:-saoki0913/career-compass-qwen3-swallow-32b-es-review-lora}"

source "$VENV_DIR/bin/activate"
python "$ROOT/ml/es_review_qwen/scripts/push_artifact_to_hub.py" \
  --source-dir "$SOURCE_DIR" \
  --repo-id "$REPO_ID" \
  --repo-type model \
  --private
