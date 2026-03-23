#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../../.." && pwd)"

exec zsh "${repo_root}/scripts/release/sync-career-compass-secrets.sh" "$@"
