#!/usr/bin/env bash
set -euo pipefail

# cloudflare.env lives next to other provider bundles: .../career_compass/cloudflare.env
# Same resolution as scripts/release/sync-career-compass-secrets.sh (see career-compass-secrets-root.sh).

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../release/career-compass-secrets-root.sh
source "${script_dir}/../../release/career-compass-secrets-root.sh"
_secret_dir="${CAREER_COMPASS_SECRETS_DIR:-${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/career_compass}"

mode="check"
if [[ "${1:-}" == "--apply" ]]; then
  mode="apply"
fi

secret_file="${_secret_dir}/cloudflare.env"
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
