#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

target=""
dry_run=0
skip_playwright=0
production_frontend_url="https://www.shupass.jp"
production_backend_health_url="https://shupass-backend-production.up.railway.app/health"
production_apex_url="https://shupass.jp"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      target="${2:-}"
      shift
      ;;
    --dry-run)
      dry_run=1
      ;;
    --skip-playwright)
      skip_playwright=1
      ;;
    -h|--help)
      echo "Usage: $0 --target <deployment-id-or-commit-sha> [--dry-run] [--skip-playwright]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

[[ -n "$target" ]] || release_die "--target is required."
require_real_binary vercel
require_real_binary railway
require_real_binary curl

cd "$repo_root"

release_log "Rollback target: $target"
if [[ "$dry_run" == "1" ]]; then
  release_log "Dry run: verify Vercel/Railway target manually, then rerun without --dry-run after approval."
  release_log "Would run production health checks after provider rollback."
  exit 0
fi

release_die "Provider rollback execution is intentionally not automated yet. Use --dry-run output for planning, then run provider-specific rollback through release-engineer approval."
