#!/bin/bash
# PostToolUse (Bash): scan command output for leaked secrets — Codex mirror.
#
# Defense-in-depth: primary protection is config.toml security.deny_patterns
# blocking reads of .secrets/ files. This hook is SUPPLEMENTARY — it warns
# when Bash output accidentally contains secret material.
#
# MUST be fail-open: always exit 0. Warnings go to stderr only.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh" 2>/dev/null || true

INPUT=$(cat 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT" 2>/dev/null || git rev-parse --show-toplevel 2>/dev/null || pwd)
PATTERNS_LIB="$PROJECT_DIR/scripts/harness/secret-patterns.sh"

OUTPUT=$(printf '%s' "$INPUT" | jq -r '[.tool_response.stderr?, .tool_response.stdout?, .tool_response.output?, .tool_output?] | map(select(. != null)) | join("\n")' 2>/dev/null || true)

# Nothing to scan
if [ -z "$OUTPUT" ]; then
  exit 0
fi

# Source shared patterns — fail silently if missing
if [ -f "$PATTERNS_LIB" ]; then
  # shellcheck source=../../scripts/harness/secret-patterns.sh
  . "$PATTERNS_LIB" 2>/dev/null || { exit 0; }
else
  exit 0
fi

# Scan and warn (never block)
if scan_for_leaked_secrets "$OUTPUT"; then
  cat >&2 <<'EOF'
WARNING: Bash output may contain leaked secret material.
Do NOT copy, log, or repeat this output. The value has already been emitted
but should not be persisted in conversation context or committed to files.
EOF
fi

exit 0
