#!/bin/bash
# Codex wrapper for guarding git push commands.
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
if [ -z "$CMD" ]; then
  exit 0
fi

if ! guard_command_is_git_push "$CMD"; then
  exit 0
fi

if guard_command_is_force_push "$CMD"; then
  cat >&2 <<'EOF'
⛔ git push --force 系は Codex でも禁止です。追加コミットか、明示承認つきの限定的な操作に切り替えてください。
EOF
  exit 2
fi

if ! guard_command_is_allowed_git_push_target "$CMD"; then
  cat >&2 <<'EOF'
⛔ Codex からの git push は `git push origin develop` のみ許可します。
main への refspec、delete/mirror/force 系、remote 省略、別 remote は実行できません。
EOF
  exit 2
fi

if [ -z "$SESSION_ID" ]; then
  echo "push の確認状態を読み取れないため、実行できませんでした。" >&2
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime codex)
PUSH_FLAG="$STATE_DIR/push-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
PUSH_REMOTE=$(guard_command_git_push_remote "$CMD")
PUSH_REFSPEC=$(guard_command_git_push_refspec "$CMD")

if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "push" "$CMD"; then
  exit 0
fi

if [ ! -f "$PUSH_FLAG" ]; then
  cat >&2 <<EOF
push はまだ実行できません。

push するとリモートのCIやデプロイ確認が動くため、対象コミットを確認してから実行してください。

開発者向けの記録手順:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind push --decision approved --project "$PROJECT_DIR" --command "$CMD" --remote "$PUSH_REMOTE" --refspec "$PUSH_REFSPEC" > "$PUSH_FLAG"
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
KIND=$(jq -r '.kind // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
APPROVED_COMMAND_HASH=$(jq -r '.commandHash // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
APPROVED_REMOTE=$(jq -r '.remote // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
APPROVED_REFSPEC=$(jq -r '.refspec // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "push" ] \
  || [ "$DECISION" != "approved" ] \
  || [ -z "$HEAD_SHA" ] \
  || [ "$APPROVED_HEAD" != "$HEAD_SHA" ] \
  || [ -z "$APPROVED_COMMAND_HASH" ] \
  || [ "$APPROVED_REMOTE" != "$PUSH_REMOTE" ] \
  || [ "$APPROVED_REFSPEC" != "$PUSH_REFSPEC" ]; then
  echo "確認後にコミットが変わったため、push 前の確認をもう一度行ってください。" >&2
  exit 2
fi

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$PUSH_FLAG" --command "$CMD" --remote "$PUSH_REMOTE" --refspec "$PUSH_REFSPEC" >/dev/null; then
  echo "確認後に差分が変わったため、push 前の確認をもう一度行ってください。" >&2
  exit 2
fi

exit 0
