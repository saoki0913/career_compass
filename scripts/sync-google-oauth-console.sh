#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
exec zsh "${script_dir}/bootstrap/career-compass/sync-google-oauth-console.sh" "$@"
