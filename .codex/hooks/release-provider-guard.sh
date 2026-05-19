#!/bin/bash
# PreToolUse (Bash): block release/deploy/provider CLI without approval checkpoint.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
# shellcheck source=lib/autonomy.sh
. "$SCRIPT_DIR/lib/autonomy.sh"
CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

if [ -z "$CMD" ] || ! guard_command_is_release_or_provider "$CMD"; then
  exit 0
fi

if guard_command_is_release_read_only "$CMD" && ! guard_command_is_release_mutating "$CMD"; then
  exit 0
fi

RELEASE_MODE=$(guard_command_release_modes "$CMD" | head -1)
RELEASE_MODE="${RELEASE_MODE:-provider}"

if [ -z "$SESSION_ID" ]; then
  echo "リリース操作の確認状態を読み取れないため、実行できませんでした。" >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime codex)
FLAG="$STATE_DIR/release-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "release" "$CMD" "$RELEASE_MODE"; then
  exit 0
fi

if [ ! -f "$FLAG" ]; then
  cat >&2 <<EOF
リリースまたは外部サービス操作はまだ実行できません。

環境に影響する操作のため、対象と目的を確認してから実行してください。

開発者向けの記録手順:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind release --decision approved --release-mode "$RELEASE_MODE" --project "$PROJECT_DIR" --command "$CMD" > "$FLAG"
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$FLAG" 2>/dev/null || echo "")
KIND=$(jq -r '.kind // empty' "$FLAG" 2>/dev/null || echo "")
APPROVED_RELEASE_MODE=$(jq -r '.releaseMode // empty' "$FLAG" 2>/dev/null || echo "")
APPROVED_COMMAND_HASH=$(jq -r '.commandHash // empty' "$FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "release" ] || [ "$DECISION" != "approved" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ] || [ "$APPROVED_RELEASE_MODE" != "$RELEASE_MODE" ]; then
  echo "確認後にコミットまたは対象環境が変わったため、リリース前の確認をもう一度行ってください。" >&2
  exit 2
fi
if [ -z "$APPROVED_COMMAND_HASH" ]; then
  echo "リリース確認が実行コマンドに結び付いていないため、確認をもう一度行ってください。" >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$FLAG" --command "$CMD" >/dev/null; then
  echo "確認後に差分が変わったため、リリース前の確認をもう一度行ってください。" >&2
  exit 2
fi

exit 0
