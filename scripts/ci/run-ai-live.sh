#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

suite="${AI_LIVE_SUITE:-smoke}"
feature="${AI_LIVE_FEATURE:-all}"
output_dir="${AI_LIVE_OUTPUT_DIR:-backend/tests/output}"
summary_file="${AI_LIVE_SUMMARY_FILE:-${GITHUB_STEP_SUMMARY:-}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite)
      suite="${2:-}"
      shift 2
      ;;
    --feature)
      feature="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    --summary-file)
      summary_file="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

case "$suite" in
  smoke|extended) ;;
  *)
    echo "Unsupported suite: $suite" >&2
    exit 2
    ;;
esac

case "$feature" in
  all|es-review|gakuchika|motivation|interview) ;;
  *)
    echo "Unsupported feature: $feature" >&2
    exit 2
    ;;
esac

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
run_dir="${output_dir%/}/ai_live_${feature//-/_}_${timestamp}"
mkdir -p "$run_dir"

status=0

run_logged() {
  local name="$1"
  shift
  local log_file="$run_dir/${name}.log"

  echo "[ai-live] running ${name} -> ${log_file}"
  set +e
  "$@" 2>&1 | tee "$log_file"
  local cmd_status=${PIPESTATUS[0]}
  set -e

  if [[ $cmd_status -ne 0 ]]; then
    status="$cmd_status"
  fi
}

export AI_LIVE_OUTPUT_DIR="$run_dir"
export LIVE_AI_CONVERSATION_CASE_SET="$suite"
export LIVE_AI_CONVERSATION_TARGET_ENV="${LIVE_AI_CONVERSATION_TARGET_ENV:-staging}"
export LIVE_ES_REVIEW_OUTPUT_DIR="$run_dir"
export LIVE_ES_REVIEW_CASE_SET="$suite"
export RUN_LIVE_ES_REVIEW=1
if [[ "$suite" == "extended" ]]; then
  export LIVE_ES_REVIEW_ENABLE_JUDGE="${LIVE_ES_REVIEW_ENABLE_JUDGE:-1}"
fi

run_es_review() {
  run_logged \
    "es-review-pytest" \
    env \
    RUN_LIVE_ES_REVIEW=1 \
    LIVE_ES_REVIEW_OUTPUT_DIR="$run_dir" \
    LIVE_ES_REVIEW_CASE_SET="$suite" \
    python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -v -s -m integration

  run_logged \
    "es-review-playwright" \
    env \
    PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://stg.shupass.jp}" \
    PLAYWRIGHT_SKIP_WEBSERVER=1 \
    CI_E2E_AUTH_SECRET="${CI_E2E_AUTH_SECRET:-}" \
    npx playwright test -c playwright.live.config.ts e2e/live-ai-major.spec.ts
}

run_conversation_feature() {
  local conversation_feature="$1"
  run_logged \
    "${conversation_feature}-playwright" \
    env \
    PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://stg.shupass.jp}" \
    PLAYWRIGHT_SKIP_WEBSERVER=1 \
    CI_E2E_AUTH_SECRET="${CI_E2E_AUTH_SECRET:-}" \
    LIVE_AI_CONVERSATION_FEATURE="$conversation_feature" \
    npx playwright test -c playwright.live.config.ts e2e/live-ai-conversations.spec.ts
}

case "$feature" in
  all)
    run_es_review
    run_conversation_feature "gakuchika"
    run_conversation_feature "motivation"
    run_conversation_feature "interview"
    ;;
  es-review)
    run_es_review
    ;;
  gakuchika|motivation|interview)
    run_conversation_feature "$feature"
    ;;
esac

if [[ -n "$summary_file" ]]; then
  mkdir -p "$(dirname "$summary_file")"
fi

summary_args=(node scripts/ci/write-ai-live-summary.mjs --output-dir "$run_dir")
if [[ -n "$summary_file" ]]; then
  summary_args+=(--summary-file "$summary_file")
fi
run_logged "summary" "${summary_args[@]}"

if [[ -n "$summary_file" && -f "$summary_file" ]]; then
  cp "$summary_file" "$run_dir/summary.md"
fi

echo "[ai-live] run dir: $run_dir"
exit "$status"
