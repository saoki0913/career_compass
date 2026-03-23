#!/bin/zsh

set -euo pipefail

mode="check"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      mode="apply"
      ;;
    --check)
      mode="check"
      ;;
    *)
      echo "Usage: $0 [--check|--apply]" >&2
      exit 1
      ;;
  esac
  shift
done

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
source "${repo_root}/scripts/release/common.sh"

run_step() {
  local name="$1"
  shift
  release_log "${name}"
  "$@"
}

run_step "Checking env inventory" zsh "${repo_root}/scripts/bootstrap/career-compass/sync-career-compass-env.sh" "--${mode}"
run_step "Checking Google OAuth inventory" zsh "${repo_root}/scripts/bootstrap/career-compass/sync-google-oauth-console.sh" "--${mode}"
run_step "Checking Supabase shared project inputs" zsh "${repo_root}/scripts/bootstrap/career-compass/bootstrap-career-compass-supabase.sh" "--${mode}"
run_step "Checking Cloudflare zone inputs" bash "${repo_root}/scripts/bootstrap/career-compass/bootstrap-cloudflare-zone.sh" "--${mode}"
