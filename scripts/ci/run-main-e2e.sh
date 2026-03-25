#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
suite="${1:-}"

cd "$repo_root"

case "$suite" in
  guest)
    npx playwright test e2e/guest-major.spec.ts
    ;;
  auth)
    npx playwright test e2e/auth-boundary.spec.ts e2e/user-major.spec.ts
    ;;
  regression)
    npx playwright test e2e/regression-bugs.spec.ts e2e/motivation.spec.ts
    ;;
  *)
    echo "Usage: $0 <guest|auth|regression>" >&2
    exit 1
    ;;
esac
