#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

npx eslint src e2e tools playwright.config.ts playwright.live.config.ts vitest.config.ts
npm run build
npm run test:unit
npm audit --audit-level=high
