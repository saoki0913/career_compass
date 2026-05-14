#!/bin/bash
# PreToolUse (Bash): block risky/contract DB migrations without approval checkpoint (Codex variant).
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

if [ -z "$CMD" ] || ! guard_command_is_migration_apply "$CMD"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "DB変更の確認状態を読み取れないため、実行できませんでした。" >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime codex)
FLAG="$STATE_DIR/migration-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

checkpoint_allows_migration() {
  if [ ! -f "$FLAG" ]; then
    return 1
  fi

  local approved_head decision kind
  approved_head=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
  decision=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
  kind=$(jq -r '.kind // empty' "$FLAG" 2>/dev/null || echo "")

  [ "$kind" = "migration" ] \
    && [ "$decision" = "approved" ] \
    && [ "$approved_head" = "$HEAD_SHA" ] \
    && node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" >/dev/null
}

block_json() {
  local reason="$1"
  local message="$2"
  local classifications="${3:-[]}"
  printf '{"decision":"block","reason":"%s","message":"%s","classifications":%s}\n' "$reason" "$message" "$classifications" >&2
  exit 2
}

# Attempt dry-run classification to detect risky/contract migrations
DRY_RUN_STATUS=0
DRY_RUN=$(node "$PROJECT_DIR/scripts/release/run-migrations.mjs" --env production --dry-run --json 2>/dev/null) || DRY_RUN_STATUS=$?

if [ -z "$DRY_RUN" ]; then
  if checkpoint_allows_migration; then
    exit 0
  fi
  block_json "MIGRATION_DRY_RUN_UNAVAILABLE" "DB変更の dry-run 結果を確認できないため、反映を停止しました。接続状態を直すか、変更内容を確認して migration checkpoint を作成してください。"
fi

if ! printf '%s' "$DRY_RUN" | jq -e 'type == "object"' >/dev/null 2>&1; then
  block_json "MIGRATION_DRY_RUN_UNAVAILABLE" "DB変更の dry-run 結果をJSONとして確認できないため、反映を停止しました。"
fi

PENDING=$(printf '%s' "$DRY_RUN" | jq -r '.pending // 0')
BLOCKER_COUNT=$(printf '%s' "$DRY_RUN" | jq -r '(.blockers // []) | length')
HISTORY_ERROR_COUNT=$(printf '%s' "$DRY_RUN" | jq -r '(.historyErrors // []) | length')
SUPABASE_PENDING=$(printf '%s' "$DRY_RUN" | jq -r '.supabasePending // 0')
EXIT_CODE=$(printf '%s' "$DRY_RUN" | jq -r '.exitCode // 0')
CLASSIFICATIONS=$(printf '%s' "$DRY_RUN" | jq '.classifications // []')

if [ "$EXIT_CODE" = "0" ] && [ "$DRY_RUN_STATUS" != "0" ]; then
  EXIT_CODE="$DRY_RUN_STATUS"
fi

if [ "$HISTORY_ERROR_COUNT" != "0" ]; then
  block_json "MIGRATION_HISTORY_DIVERGED" "DB migration 履歴の不整合を検出したため、反映を停止しました。履歴を解消してから再実行してください。" "$CLASSIFICATIONS"
fi

if [ "$SUPABASE_PENDING" != "0" ]; then
  block_json "SUPABASE_MIGRATION_PENDING" "Supabase 側の未適用 migration を検出したため、Drizzle migration の反映を停止しました。Supabase migration を先に確認してください。" "$CLASSIFICATIONS"
fi

if [ "$EXIT_CODE" != "0" ] && [ "$BLOCKER_COUNT" = "0" ]; then
  block_json "MIGRATION_DRY_RUN_FAILED" "DB変更の dry-run が失敗したため、反映を停止しました。失敗原因を解消してから再実行してください。" "$CLASSIFICATIONS"
fi

if [ "$PENDING" = "0" ] && [ "$BLOCKER_COUNT" = "0" ]; then
  exit 0
fi

# Risky/contract detected -- check checkpoint
if checkpoint_allows_migration; then
  exit 0
fi

block_json "ESCALATION_REQUIRED" "DB変更を反映する前に、変更内容と影響範囲の確認が必要です。" "$CLASSIFICATIONS"
