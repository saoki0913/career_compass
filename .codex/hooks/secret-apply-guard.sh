#!/bin/bash
# PreToolUse (Bash): block production secret apply without approval checkpoint (Codex variant).
# Staging targets are auto-allowed; production/all targets require explicit approval.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_secret_apply_production "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "本番向けシークレット反映の確認状態を読み取れないため、実行できませんでした。" >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime codex)
FLAG="$STATE_DIR/secret-apply-production-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ -f "$FLAG" ]; then
  APPROVED_HEAD=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
  DECISION=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
  KIND=$(jq -r '.kind // empty' "$FLAG" 2>/dev/null || echo "")
  COMMAND_HASH=$(jq -r '.commandHash // empty' "$FLAG" 2>/dev/null || echo "")
  if [ "$KIND" = "secret-apply" ] \
    && [ "$DECISION" = "approved" ] \
    && [ "$APPROVED_HEAD" = "$HEAD_SHA" ] \
    && [ -n "$COMMAND_HASH" ] \
    && node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" --command "$CMD" >/dev/null; then
    exit 0
  fi
fi

printf '{"decision":"block","reason":"ESCALATION_REQUIRED","message":"本番向けシークレットを反映する前に、対象環境と影響範囲の確認が必要です。"}\n' >&2
exit 2
