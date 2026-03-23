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

secret_file="${CODEX_COMPANY_SECRETS_ROOT:-/Users/saoki/work/codex-company/.secrets}/career_compass/supabase.env"
[[ -f "$secret_file" ]] || release_die "Missing secret file: ${secret_file}"

set -a
source "$secret_file"
set +a

[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || release_die "SUPABASE_ACCESS_TOKEN is required"
[[ -n "${SUPABASE_ORG_ID:-}" ]] || release_die "SUPABASE_ORG_ID is required"
[[ -n "${SUPABASE_PRODUCTION_PROJECT_REF:-}" ]] || release_die "SUPABASE_PRODUCTION_PROJECT_REF is required"

export SUPABASE_ACCESS_TOKEN

if [[ "$mode" == "apply" ]]; then
  project_exists="$(
    run_real supabase projects list -o json | \
      python3 -c 'import json,sys; data=json.load(sys.stdin); target=sys.argv[1]; print("yes" if any(p.get("id")==target for p in data) else "")' \
      "${SUPABASE_PRODUCTION_PROJECT_REF}"
  )"
  [[ "$project_exists" == "yes" ]] || release_die "Supabase project ref not found: ${SUPABASE_PRODUCTION_PROJECT_REF}"
fi

release_log "Checked Supabase single-project bootstrap inputs"
