#!/bin/bash
# PreToolUse (Edit|Write): Plan mode 使用後、最初の実装 Edit/Write を委譲判断まで block する。
# plan-exited フラグがなければ (Plan mode 未使用) 素通り。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */.claude/plans/*|*/.claude/state/*|*/codex-handoffs/*)
    exit 0
    ;;
esac

STATE_DIR="$HOME/.claude/sessions/career_compass"
PLAN_FLAG="$STATE_DIR/plan-exited-$SESSION_ID"
DELEGATION_FLAG="$STATE_DIR/codex-delegation-checkpoint-$SESSION_ID"

if [ ! -f "$PLAN_FLAG" ]; then
  exit 0
fi

if [ ! -f "$DELEGATION_FLAG" ]; then
  cat >&2 <<EOF
⛔ 実装開始をブロックしました。

Plan mode が使用されましたが、Codex 委譲判断が未完了です。
CLAUDE.md §A: 最初の Edit|Write の前に委譲判断を行ってください。

手順:
  1. AskUserQuestion で「この実装を Codex に委譲しますか？」と確認
     以下の情報を提示すること:
       a. 委譲スコープ（変更対象ファイル一覧・推定変更行数）
       b. 推奨 Codex エージェント（.codex/agents/*.toml から最適なもの）
       c. コンテキスト準備計画（Section C-4 のどの要素を含めるか）
       d. 推定所要時間（小: ~5min, 中: ~15min, 大: ~30min）
       e. 委譲戦略オプション（一括 vs 分割）
  2. ユーザーの回答をメモに記録
  3. フラグ設定: echo "<decision>" > $DELEGATION_FLAG
     (<decision> = delegate / no-delegate / partial)
  4. 再度 Edit|Write を実行
EOF
  exit 2
fi

DELEG_CONTENT=$(tr -d '[:space:]' < "$DELEGATION_FLAG" 2>/dev/null || echo "")
case "$DELEG_CONTENT" in
  delegate|no-delegate|partial) ;;
  *)
    cat >&2 <<EOF
⛔ 実装開始をブロックしました。

delegation checkpoint の内容が不正: "$DELEG_CONTENT"
許可値: delegate / no-delegate / partial

手順:
  echo "<decision>" > $DELEGATION_FLAG
  (<decision> = delegate / no-delegate / partial)
EOF
    exit 2
    ;;
esac

exit 0
