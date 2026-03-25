#!/usr/bin/env bash
# Backward-compatible wrapper: extended case set, 5 rounds, then aggregate.
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/run-live-es-review-extended.sh" --run 5 "$@"
