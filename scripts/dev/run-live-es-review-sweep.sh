#!/usr/bin/env bash
# Run live ES review smoke ×5 and extended ×5 with 4 default models; collect JSON reports.
# Requires API keys in env (see docs/testing/ES_REVIEW_QUALITY.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export RUN_LIVE_ES_REVIEW=1
export LIVE_ES_REVIEW_COLLECT_ONLY=1
export LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=0
export LIVE_ES_REVIEW_CAPTURE_DEBUG=1
export LIVE_ES_REVIEW_OUTPUT_DIR="${LIVE_ES_REVIEW_OUTPUT_DIR:-backend/tests/output}"

# Override with LIVE_ES_REVIEW_PROVIDERS if set; else 4-model matrix
if [[ -z "${LIVE_ES_REVIEW_PROVIDERS:-}" ]]; then
  export LIVE_ES_REVIEW_PROVIDERS="gpt-5.4-mini,gpt-5.4,claude-sonnet,gemini-3.1-pro-preview"
fi

PYTEST=(python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -m integration --tb=no -q)

for i in 1 2 3 4 5; do
  echo "=== live smoke round ${i}/5 (providers=${LIVE_ES_REVIEW_PROVIDERS}) ==="
  LIVE_ES_REVIEW_CASE_SET=smoke \
    LIVE_ES_REVIEW_ENABLE_JUDGE="${LIVE_ES_REVIEW_ENABLE_JUDGE_SMOKE:-0}" \
    LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS="${LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS_SMOKE:-0}" \
    "${PYTEST[@]}"
done

for i in 1 2 3 4 5; do
  echo "=== live extended round ${i}/5 ==="
  LIVE_ES_REVIEW_CASE_SET=extended \
    LIVE_ES_REVIEW_ENABLE_JUDGE=1 \
    LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS="${LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS_EXTENDED:-0}" \
    "${PYTEST[@]}"
done

echo "=== aggregate ==="
python scripts/dev/aggregate_live_es_review_runs.py
