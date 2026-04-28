#!/bin/bash
# PreToolUse (Bash): git push はユーザー承認 checkpoint なしでは block。
set -euo pipefail
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"
if [ -z "$CMD" ]; then
  exit 0
fi

# git push が含まれていない Bash コマンドは素通り
if ! guard_command_is_git_push "$CMD"; then
  exit 0
fi

# --force / -f / --force-with-lease は block
if guard_command_is_force_push "$CMD"; then
  cat >&2 <<'EOF'
⛔ git push --force 系は明示承認なしでは実行できません。

代替案:
  - 追加コミットで修正
  - git push --force-with-lease=<refname>:<expected> をユーザー承認のもとで
  - rebase による履歴整理が本当に必要か、PR レビュー後に検討

release の正本は make deploy / scripts/release/release-career-compass.sh です。
EOF
  exit 2
fi

if [ -z "$SESSION_ID" ]; then
  cat >&2 <<'EOF'
⛔ git push をブロックしました。

session_id を取得できないため、push 承認 checkpoint を検証できません。
EOF
  exit 2
fi

STATE_DIR=$(guard_state_dir_for_runtime claude)
PUSH_FLAG="$STATE_DIR/push-approved-$SESSION_ID"
HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")

if [ ! -f "$PUSH_FLAG" ]; then
  cat >&2 <<EOF
⛔ git push をブロックしました。

push は GitHub Actions CI / Staging deploy を発火するため、ユーザー承認が必須です。

手順:
  1. git log origin/develop..HEAD --oneline で push 対象 commit を確認
  2. AskUserQuestion で push 可否を確認
  3. 承認後に checkpoint を作成:
     node scripts/harness/diff-snapshot.mjs checkpoint --kind push --decision approved --project "$PROJECT_DIR" > "$PUSH_FLAG"
  4. 再度 git push を実行
EOF
  exit 2
fi

APPROVED_HEAD=$(jq -r '.headSha // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
DECISION=$(jq -r '.decision // empty' "$PUSH_FLAG" 2>/dev/null || echo "")
if [ "$DECISION" != "approved" ] || [ -z "$HEAD_SHA" ] || [ "$APPROVED_HEAD" != "$HEAD_SHA" ]; then
  cat >&2 <<EOF
⛔ git push をブロックしました。

push checkpoint が現在の HEAD と一致しません。
checkpoint=$PUSH_FLAG
approved_head=$APPROVED_HEAD
current_head=$HEAD_SHA
EOF
  exit 2
fi

exit 0
