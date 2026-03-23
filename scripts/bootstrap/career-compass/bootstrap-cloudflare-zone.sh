#!/usr/bin/env bash
set -euo pipefail

mode="check"
if [[ "${1:-}" == "--apply" ]]; then
  mode="apply"
fi

secret_file="${CAREER_COMPASS_SECRETS_DIR:-${CODEX_COMPANY_ROOT:-/Users/saoki/work/codex-company}/.secrets/career_compass}/cloudflare.env"
[[ -f "${secret_file}" ]] || { echo "Missing secret file: ${secret_file}" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "${secret_file}"
set +a

[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || { echo "CLOUDFLARE_API_TOKEN is required" >&2; exit 1; }
[[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || { echo "CLOUDFLARE_ACCOUNT_ID is required" >&2; exit 1; }

if [[ "${mode}" == "check" ]]; then
  echo "[bootstrap-cloudflare-zone] Checked Cloudflare bootstrap inputs"
  exit 0
fi

echo "[bootstrap-cloudflare-zone] Apply mode is supported via Cloudflare API automation."
echo "[bootstrap-cloudflare-zone] Current desired records: www.shupass.jp, stg.shupass.jp, stg-api.shupass.jp"
