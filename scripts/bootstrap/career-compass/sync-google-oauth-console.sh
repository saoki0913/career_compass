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
# shellcheck source=../../release/career-compass-secrets-root.sh
source "${repo_root}/scripts/release/career-compass-secrets-root.sh"

secret_file="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/google-oauth/career_compass.env"
[[ -f "$secret_file" ]] || release_die "Missing secret file: ${secret_file}"

set -a
source "$secret_file"
set +a

[[ -n "${GOOGLE_CLIENT_ID:-}" ]] || release_die "GOOGLE_CLIENT_ID is required"
[[ -n "${GOOGLE_CLIENT_SECRET:-}" ]] || release_die "GOOGLE_CLIENT_SECRET is required"

run_real gcloud auth list >/dev/null
release_log "Google OAuth desired state"
release_log "Origins: http://localhost:3000, https://stg.shupass.jp, https://www.shupass.jp, https://shupass.jp"
release_log "Redirects: /api/auth/callback/google for localhost/stg/www"

if [[ "$mode" == "apply" ]]; then
  run_real zsh "${repo_root}/scripts/auth/import-google-oauth-to-vercel.sh"
  release_warn "Google Cloud Console redirect URI sync still requires browser/manual confirmation."
fi
