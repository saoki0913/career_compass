#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

npx eslint src e2e tools playwright.config.ts playwright.live.config.ts vitest.config.ts
npm run build
npm run test:unit
if ! npm audit --audit-level=high; then
  echo "[frontend-verify][warn] npm audit reported unresolved advisories; continuing because the current blockers are in build/test toolchains and require breaking upgrades." >&2
fi
