#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV_DIR="${VENV_DIR:-$ROOT/ml/es_review_qwen/.venv}"
DEFAULT_CONFIG="$ROOT/ml/es_review_qwen/configs/qwen3_swallow_32b_lora.json"
A6000_CONFIG="$ROOT/ml/es_review_qwen/configs/qwen3_swallow_32b_a6000_lora.json"
CONFIG_PATH="${1:-}"

source "$VENV_DIR/bin/activate"
python "$ROOT/ml/es_review_qwen/scripts/preflight_swallow_32b.py"

if [ -z "$CONFIG_PATH" ]; then
  if nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits | grep -Eq "RTX A6000|RTX 6000 Ada"; then
    CONFIG_PATH="$A6000_CONFIG"
  else
    CONFIG_PATH="$DEFAULT_CONFIG"
  fi
fi

if [ -z "${CUDA_VISIBLE_DEVICES:-}" ]; then
  BEST_GPU="$(
    nvidia-smi --query-gpu=index,memory.free --format=csv,noheader,nounits \
      | sort -t',' -k2 -nr \
      | head -n1 \
      | cut -d',' -f1 \
      | tr -d ' '
  )"
  export CUDA_VISIBLE_DEVICES="$BEST_GPU"
fi

echo "[train] using CUDA_VISIBLE_DEVICES=$CUDA_VISIBLE_DEVICES"
echo "[train] using config: $CONFIG_PATH"
python "$ROOT/ml/es_review_qwen/scripts/train_unsloth_sft.py" --config "$CONFIG_PATH"
