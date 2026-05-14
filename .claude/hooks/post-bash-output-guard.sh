#!/bin/bash
# PostToolUse (Bash): scan command output for leaked secrets.
#
# Defense-in-depth: primary protection is permissions.deny blocking Read(.secrets/**).
# This hook is SUPPLEMENTARY — it warns when Bash output accidentally contains
# secret material (env dump, curl response, log tail, etc.).
#
# MUST be fail-open: always exit 0. Warnings go to stderr only.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PATTERNS_LIB="$PROJECT_DIR/scripts/harness/secret-patterns.sh"

# Parse JSON from stdin. Hook payloads vary between tool_output and tool_response.
INPUT=$(cat 2>/dev/null || true)
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
If this is a false positive (e.g., a pattern in test fixtures), you may ignore.
EOF
fi

exit 0
