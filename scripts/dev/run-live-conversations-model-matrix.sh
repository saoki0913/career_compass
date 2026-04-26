#!/usr/bin/env bash
# Run live-ai-conversations Playwright suite multiple times with different FastAPI MODEL_* aliases.
# FastAPI reads model env at process start — restart uvicorn (or tools/start-fastapi-playwright.sh) between iterations.
#
# Usage (repo root):
#   bash scripts/dev/run-live-conversations-model-matrix.sh
#
# Optional env:
#   MODEL_MATRIX_MODELS="gpt-mini claude-sonnet gemini gpt-nano"   # space-separated aliases (backend/app/utils/llm.py)
#   PLAYWRIGHT_BASE_URL  LIVE_AI_CONVERSATION_CASE_SET  etc.

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
cd "$repo_root"

models_raw="${MODEL_MATRIX_MODELS:-gpt-mini claude-sonnet gemini gpt-nano}"
read -r -a models <<< "${models_raw}"

stamp_base="$(date -u +%Y%m%dT%H%M%SZ)"
out_root="${MODEL_MATRIX_OUT_ROOT:-backend/tests/output/conversation_model_matrix_${stamp_base}}"
mkdir -p "$out_root"

log() {
  printf '[conv-model-matrix] %s\n' "$*"
}

log "Output root: ${out_root}"
log "Models: ${models[*]}"
log "IMPORTANT: Restart FastAPI after each iteration so MODEL_GAKUCHIKA / MODEL_MOTIVATION / MODEL_INTERVIEW take effect."

for m in "${models[@]}"; do
  [[ -z "${m// }" ]] && continue
  run_dir="${out_root}/${m}"
  mkdir -p "$run_dir"
  log "=== model=${m} -> ${run_dir} (ensure FastAPI was started with this MODEL_* set) ==="
  MODEL_GAKUCHIKA="$m" \
    MODEL_MOTIVATION="$m" \
    MODEL_INTERVIEW="$m" \
    MODEL_GAKUCHIKA_DRAFT="${MODEL_GAKUCHIKA_DRAFT:-claude-sonnet}" \
    MODEL_MOTIVATION_DRAFT="${MODEL_MOTIVATION_DRAFT:-claude-sonnet}" \
    MODEL_INTERVIEW_FEEDBACK="${MODEL_INTERVIEW_FEEDBACK:-claude-sonnet}" \
    AI_LIVE_OUTPUT_DIR="$run_dir" \
    PLAYWRIGHT_SKIP_WEBSERVER="${PLAYWRIGHT_SKIP_WEBSERVER:-1}" \
    npx playwright test -c playwright.live.config.ts e2e/live-smoke/live-ai-conversations.spec.ts || true
done

log "Done. Merge reports with:"
log "  node scripts/ci/merge-live-conversation-reports.mjs ${out_root}/merged_gakuchika.json gpt-mini=${out_root}/gpt-mini/live_gakuchika_*.json"
