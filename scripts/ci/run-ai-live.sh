#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

suite="${AI_LIVE_SUITE:-smoke}"
feature="${AI_LIVE_FEATURE:-all}"
output_dir="${AI_LIVE_OUTPUT_DIR:-backend/tests/output}"
summary_file="${AI_LIVE_SUMMARY_FILE:-${GITHUB_STEP_SUMMARY:-}}"
skip_summary="${AI_LIVE_SKIP_SUMMARY:-0}"

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
    --skip-summary)
      skip_summary="1"
      shift
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
  all|es-review|company-info-search|rag-ingest|selection-schedule|gakuchika|motivation|interview) ;;
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
export LIVE_COMPANY_INFO_CASE_SET="$suite"
export LIVE_COMPANY_INFO_TARGET_ENV="${LIVE_COMPANY_INFO_TARGET_ENV:-staging}"
export RUN_LIVE_ES_REVIEW=1
if [[ "$suite" == "extended" ]]; then
  export LIVE_ES_REVIEW_ENABLE_JUDGE="${LIVE_ES_REVIEW_ENABLE_JUDGE:-1}"
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    case "${LIVE_AI_CONVERSATION_LLM_JUDGE-__unset__}" in
      "0" | "false" | "FALSE") ;;
      *) export LIVE_AI_CONVERSATION_LLM_JUDGE=1 ;;
    esac
  fi
fi

run_es_review() {
  local blocking_failures="1"
  if [[ "$suite" == "extended" ]]; then
    blocking_failures="0"
  fi

  run_logged \
    "es-review-pytest" \
    env \
    RUN_LIVE_ES_REVIEW=1 \
    LIVE_ES_REVIEW_OUTPUT_DIR="$run_dir" \
    LIVE_ES_REVIEW_CASE_SET="$suite" \
    LIVE_ES_REVIEW_BLOCKING_FAILURES="$blocking_failures" \
    python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -v -s -m integration

  if [[ "${AI_LIVE_SKIP_ES_REVIEW_PLAYWRIGHT:-}" == "1" ]]; then
    echo "[ai-live] skipping es-review-playwright (AI_LIVE_SKIP_ES_REVIEW_PLAYWRIGHT=1)"
  else
    run_logged \
      "es-review-playwright" \
      env \
      PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://stg.shupass.jp}" \
      PLAYWRIGHT_SKIP_WEBSERVER=1 \
      CI_E2E_AUTH_SECRET="${CI_E2E_AUTH_SECRET:-}" \
      npx playwright test -c playwright.live.config.ts e2e/live-ai-major.spec.ts
  fi
}

run_conversation_feature() {
  local conversation_feature="$1"
  local upper_feature
  upper_feature="$(echo "$conversation_feature" | tr '[:lower:]' '[:upper:]')"

  run_logged \
    "${conversation_feature}-pytest" \
    env \
    AI_LIVE_BASE_URL="${PLAYWRIGHT_BASE_URL:-${AI_LIVE_BASE_URL:-https://stg.shupass.jp}}" \
    CI_E2E_AUTH_SECRET="${CI_E2E_AUTH_SECRET:-}" \
    CI_E2E_SCOPE="${CI_E2E_SCOPE:-}" \
    AI_LIVE_OUTPUT_DIR="$run_dir" \
    LIVE_AI_CONVERSATION_CASE_SET="$suite" \
    "RUN_LIVE_${upper_feature}=1" \
    python -m pytest "backend/tests/${conversation_feature}/integration/test_live_${conversation_feature}_report.py" -v -s -m integration
}

run_company_info_feature() {
  local company_feature="$1"
  local env_flag=""
  local pytest_target=""

  case "$company_feature" in
    rag-ingest)
      env_flag="RUN_LIVE_RAG_INGEST=1"
      pytest_target="backend/tests/company_info/integration/test_live_rag_ingest_report.py"
      ;;
    selection-schedule)
      env_flag="RUN_LIVE_SELECTION_SCHEDULE=1"
      pytest_target="backend/tests/company_info/integration/test_live_selection_schedule_report.py"
      ;;
    *)
      echo "Unsupported company info feature: $company_feature" >&2
      exit 2
      ;;
  esac

  run_logged \
    "${company_feature}-pytest" \
    env \
    AI_LIVE_OUTPUT_DIR="$run_dir" \
    LIVE_COMPANY_INFO_CASE_SET="$suite" \
    LIVE_COMPANY_INFO_TARGET_ENV="${LIVE_COMPANY_INFO_TARGET_ENV:-staging}" \
    ${env_flag} \
    python -m pytest "$pytest_target" -v -s -m integration
}

run_company_info_search_feature() {
  local sample_size="30"
  local per_industry_min="1"

  if [[ "$suite" == "extended" ]]; then
    sample_size="120"
    per_industry_min="2"
  fi

  run_logged \
    "company-info-search-pytest" \
    env \
    AI_LIVE_OUTPUT_DIR="$run_dir" \
    LIVE_COMPANY_INFO_CASE_SET="$suite" \
    LIVE_COMPANY_INFO_TARGET_ENV="${LIVE_COMPANY_INFO_TARGET_ENV:-staging}" \
    RUN_LIVE_SEARCH=1 \
    LIVE_SEARCH_USE_CURATED=1 \
    LIVE_SEARCH_SAMPLE_SIZE="$sample_size" \
    LIVE_SEARCH_PER_INDUSTRY_MIN="$per_industry_min" \
    LIVE_SEARCH_FAIL_ON_REGRESSION=0 \
    LIVE_SEARCH_FAIL_ON_LOW_RATE=0 \
    BASELINE_SAVE=0 \
    BASELINE_AUTO_PROMOTE=0 \
    python -m pytest backend/tests/company_info/integration/test_live_company_info_search_report.py -v -s -m integration
}

case "$feature" in
  all)
    run_es_review
    run_company_info_search_feature
    run_company_info_feature "rag-ingest"
    run_company_info_feature "selection-schedule"
    run_conversation_feature "gakuchika"
    run_conversation_feature "motivation"
    run_conversation_feature "interview"
    ;;
  es-review)
    run_es_review
    ;;
  company-info-search)
    run_company_info_search_feature
    ;;
  rag-ingest|selection-schedule)
    run_company_info_feature "$feature"
    ;;
  gakuchika|motivation|interview)
    run_conversation_feature "$feature"
    ;;
esac

if [[ "$skip_summary" != "1" ]]; then
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
fi

echo "[ai-live] run dir: $run_dir"
exit "$status"
