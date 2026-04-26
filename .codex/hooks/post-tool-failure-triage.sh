#!/bin/bash
# PostToolUse (Bash): add next-step context after failed commands.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
if [ "$TOOL" != "Bash" ]; then
  exit 0
fi

CMD=$(codex_tool_command "$INPUT")
EXIT_CODE=$(printf '%s' "$INPUT" | jq -r '.tool_response.exit_code // .tool_response.exitCode // empty' 2>/dev/null || true)
OUTPUT=$(printf '%s' "$INPUT" | jq -r '[.tool_response.stderr?, .tool_response.stdout?, .tool_response.output?] | map(select(. != null)) | join("\n")' 2>/dev/null || true)

if [ -z "$EXIT_CODE" ] || [ "$EXIT_CODE" = "0" ]; then
  exit 0
fi

CONTEXT=""
if printf '%s' "$OUTPUT" | grep -qiE 'sandbox|permission|operation not permitted|not permitted'; then
  CONTEXT="This Bash failure may be sandbox/permission related. Do not retry blindly; request escalation only if the command is necessary."
elif printf '%s' "$OUTPUT" | grep -qiE 'ENOTFOUND|EAI_AGAIN|network|temporary failure'; then
  CONTEXT="This Bash failure may be network related. If dependency fetch or remote access is required, consider an approved escalation."
elif printf '%s' "$CMD" | grep -qiE 'npm run test|pytest|vitest|playwright'; then
  CONTEXT="This is a verification command failure. Read the failing assertion and fix the root cause before rerunning."
fi

if [ -z "$CONTEXT" ]; then
  exit 0
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $ctx
  }
}'
