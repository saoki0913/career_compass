#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
suite="${1:-}"
retries="${PLAYWRIGHT_RETRIES:-}"

export CI_SECRETS_PREFER_BUNDLE=1

# shellcheck source=load-github-actions-secrets.sh
source "${script_dir}/load-github-actions-secrets.sh"

cd "$repo_root"

run_playwright() {
  if [[ -n "$retries" ]]; then
    npx playwright test --retries="$retries" "$@"
  else
    npx playwright test "$@"
  fi
}

case "$suite" in
  guest)
    run_playwright e2e/guest-major.spec.ts
    ;;
  auth)
    run_playwright e2e/auth-boundary.spec.ts e2e/user-major.spec.ts
    ;;
  regression)
    run_playwright e2e/regression-bugs.spec.ts e2e/motivation.spec.ts
    ;;
  all)
    run_playwright \
      e2e/guest-major.spec.ts \
      e2e/auth-boundary.spec.ts \
      e2e/user-major.spec.ts \
      e2e/regression-bugs.spec.ts \
      e2e/motivation.spec.ts
    ;;
  *)
    echo "Usage: $0 <guest|auth|regression|all>" >&2
    exit 1
    ;;
esac
