#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

export CI_SECRETS_PREFER_BUNDLE=1

# shellcheck source=load-github-actions-secrets.sh
source "${script_dir}/load-github-actions-secrets.sh"

cd "$repo_root"

features="all"
suite="${LIVE_AI_CONVERSATION_CASE_SET:-smoke}"
output_dir="${AI_LIVE_OUTPUT_DIR:-backend/tests/output}"

all_features=(
  "es-review"
  "gakuchika"
  "motivation"
  "interview"
  "company-info-search"
  "rag-ingest"
  "selection-schedule"
  "calendar"
  "tasks-deadlines"
  "notifications"
  "company-crud"
  "billing"
  "search-query"
  "pages-smoke"
)

usage() {
  echo "Usage: $0 [--features all|csv] [--suite smoke|extended] [--output-dir dir]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --features)
      features="${2:-}"
      shift 2
      ;;
    --suite)
      suite="${2:-}"
      shift 2
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    *)
      usage
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

feature_list=()
if [[ "$features" == "all" ]]; then
  feature_list=("${all_features[@]}")
else
  IFS=',' read -r -a requested_features <<< "$features"
  for feature in "${requested_features[@]}"; do
    feature="$(echo "$feature" | tr -d '[:space:]')"
    case "$feature" in
      es-review|gakuchika|motivation|interview|company-info-search|rag-ingest|selection-schedule|calendar|tasks-deadlines|notifications|company-crud|billing|search-query|pages-smoke)
        feature_list+=("$feature")
        ;;
      *)
        echo "Unsupported feature: $feature" >&2
        exit 2
        ;;
    esac
  done
fi

mkdir -p "$output_dir"

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://stg.shupass.jp}"
export PLAYWRIGHT_SKIP_WEBSERVER="${PLAYWRIGHT_SKIP_WEBSERVER:-1}"
export LIVE_AI_CONVERSATION_CASE_SET="$suite"
export LIVE_AI_CONVERSATION_BLOCKING_FAILURES="${LIVE_AI_CONVERSATION_BLOCKING_FAILURES:-1}"
export LIVE_AI_CONVERSATION_TARGET_ENV="${LIVE_AI_CONVERSATION_TARGET_ENV:-staging}"
export LIVE_COMPANY_INFO_TARGET_ENV="${LIVE_COMPANY_INFO_TARGET_ENV:-staging}"

status=0

for feature in "${feature_list[@]}"; do
  summary_file="${output_dir%/}/summary-${feature}.md"
  echo "[functional-e2e] running feature=${feature} suite=${suite}"
  set +e
  AI_LIVE_OUTPUT_DIR="$output_dir" \
  AI_LIVE_SUMMARY_FILE="$summary_file" \
  AI_LIVE_SKIP_SUMMARY=0 \
  bash scripts/ci/run-ai-live.sh --feature "$feature" --suite "$suite" --output-dir "$output_dir"
  feature_status=$?
  set -e
  if [[ $feature_status -ne 0 ]]; then
    status=$feature_status
  fi
done

exit "$status"
