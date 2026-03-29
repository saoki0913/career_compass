#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

suite="${AI_LIVE_SUITE:-smoke}"
output_dir="${AI_LIVE_OUTPUT_DIR:-backend/tests/output}"
summary_file="${AI_LIVE_SUMMARY_FILE:-${GITHUB_STEP_SUMMARY:-}}"
playwright_specs_raw="${AI_LIVE_PLAYWRIGHT_SPECS:-e2e/live-ai-major.spec.ts}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --suite)
      suite="${2:-}"
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
    --playwright-specs)
      playwright_specs_raw="${2:-}"
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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
run_dir="${output_dir%/}/nightly_ai_live_${timestamp}"
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

  if [[ $cmd_status -ne 0 && $status -eq 0 ]]; then
    status="$cmd_status"
  elif [[ $cmd_status -ne 0 ]]; then
    status="$cmd_status"
  fi
}

playwright_specs=()
if [[ -n "$playwright_specs_raw" ]]; then
  # shellcheck disable=SC2206
  playwright_specs=($playwright_specs_raw)
  filtered_specs=()
  for spec in "${playwright_specs[@]}"; do
    if [[ -f "$spec" ]]; then
      filtered_specs+=("$spec")
    fi
  done
  playwright_specs=("${filtered_specs[@]}")
fi

export AI_LIVE_OUTPUT_DIR="$run_dir"
export LIVE_ES_REVIEW_OUTPUT_DIR="$run_dir"
export LIVE_AI_CONVERSATION_CASE_SET="$suite"
export LIVE_AI_CONVERSATION_TARGET_ENV="${LIVE_AI_CONVERSATION_TARGET_ENV:-staging}"
export RUN_LIVE_ES_REVIEW=1
export LIVE_ES_REVIEW_CASE_SET="$suite"
if [[ "$suite" == "extended" ]]; then
  export LIVE_ES_REVIEW_ENABLE_JUDGE="${LIVE_ES_REVIEW_ENABLE_JUDGE:-1}"
fi

run_logged \
  "es-live" \
  env \
  RUN_LIVE_ES_REVIEW=1 \
  LIVE_ES_REVIEW_OUTPUT_DIR="$run_dir" \
  LIVE_ES_REVIEW_CASE_SET="$suite" \
  python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -v -s -m integration

if [[ ${#playwright_specs[@]} -gt 0 ]]; then
  run_logged \
    "playwright-live" \
    env \
    PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://stg.shupass.jp}" \
    PLAYWRIGHT_SKIP_WEBSERVER=1 \
    CI_E2E_AUTH_SECRET="${CI_E2E_AUTH_SECRET:-}" \
    npx playwright test -c playwright.live.config.ts "${playwright_specs[@]}"
else
  echo "[ai-live] no playwright specs configured; skipping"
fi

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
