#!/usr/bin/env bash
set -euo pipefail

# cloudflare.env lives under the infra provider bundle: .../career_compass/infra/cloudflare.env
# Same resolution as scripts/release/sync-career-compass-secrets.sh (see career-compass-secrets-root.sh).

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"
# shellcheck source=../../release/career-compass-secrets-root.sh
source "${script_dir}/../../release/career-compass-secrets-root.sh"
if [[ -n "${CAREER_COMPASS_SECRETS_DIR:-}" ]]; then
  _secret_dir="${CAREER_COMPASS_SECRETS_DIR}"
elif [[ -d "${repo_root}/.secrets" ]]; then
  _secret_dir="${repo_root}/.secrets"
else
  _secret_dir="${CAREER_COMPASS_SECRETS_ROOT_EFFECTIVE}/career_compass"
fi

mode="check"
if [[ "${1:-}" == "--apply" ]]; then
  mode="apply"
fi

secret_file="${_secret_dir}/infra/cloudflare.env"
legacy_secret_file="${_secret_dir}/cloudflare.env"
if [[ ! -f "${secret_file}" && -f "${legacy_secret_file}" ]]; then
  echo "Legacy Cloudflare secret file detected: ${legacy_secret_file}" >&2
  echo "Move it to ${secret_file}" >&2
  exit 1
fi
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
