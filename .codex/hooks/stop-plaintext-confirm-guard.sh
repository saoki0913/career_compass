#!/bin/bash
# Stop: advisory compatibility shim.
#
# Codex can run without an AskUserQuestion-style tool in Default mode. Final
# text checks that require that tool can deadlock closeout, so execution safety
# lives in PreToolUse/PermissionRequest hooks instead.
set -euo pipefail

cat >/dev/null
jq -n '{continue: true}'
