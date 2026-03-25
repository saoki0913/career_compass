#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

if [[ "${RUN_AI_LIVE_SMOKE:-0}" != "1" ]]; then
  echo "RUN_AI_LIVE_SMOKE is not enabled; skipping."
  exit 0
fi

python -m pytest backend/tests/es_review/integration/test_live_es_review_provider_report.py -v -s -m "integration"
