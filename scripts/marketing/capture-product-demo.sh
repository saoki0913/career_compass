#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
base_url="${PLAYWRIGHT_BASE_URL:-https://www.shupass.jp}"

cd "$repo_root"

PLAYWRIGHT_BASE_URL="$base_url" \
PLAYWRIGHT_SKIP_WEBSERVER=1 \
npx playwright test e2e/demo-recording.spec.ts --project=chromium --workers=1 "$@"
