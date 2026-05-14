#!/bin/bash
# PreToolUse (Edit|Write): プロンプトファイル変更後の AskUserQuestion 確認を強制する。
# post-edit-dispatcher.sh が prompt-review-pending フラグを作成 → このフックが次の Edit/Write をブロック。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
PENDING_FLAG="$STATE_DIR/prompt-review-pending-$SESSION_ID"
CONFIRMED_FLAG="$STATE_DIR/prompt-review-confirmed-$SESSION_ID"

if [ ! -f "$PENDING_FLAG" ]; then
  exit 0
fi

if [ -f "$CONFIRMED_FLAG" ]; then
  PENDING_MTIME=$(stat -f %m "$PENDING_FLAG" 2>/dev/null || echo 0)
  CONFIRMED_MTIME=$(stat -f %m "$CONFIRMED_FLAG" 2>/dev/null || echo 0)
  if [ "$CONFIRMED_MTIME" -gt "$PENDING_MTIME" ]; then
    exit 0
  fi
fi

EDITED_FILE=$(head -1 "$PENDING_FLAG" 2>/dev/null || echo "(unknown)")

cat >&2 <<EOF
⛔ プロンプトファイルの変更確認が未完了です。

${EDITED_FILE} が変更されましたが、ユーザーの確認がまだです。

手順:
  1. AskUserQuestion では、人間が判断しやすい日本語で変更内容を提示
     - どこを変えたか、なぜ変えたか、出力にどう影響するかを含める
     - 選択肢は「この内容で進める」「見直す」にする
  2. ユーザーが確認 → touch $CONFIRMED_FLAG
  3. ユーザーが差し戻し → 変更を元に戻してから続行
  4. 次の Edit|Write を再実行
EOF
exit 2
