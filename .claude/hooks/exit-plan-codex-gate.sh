#!/bin/bash
# PreToolUse (ExitPlanMode): Codex plan_review + delegation decision チェックポイントを強制する。
# 両フラグ未設定 → exit 2 (ブロック)、両方設定済み → exit 0 (許可)。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -z "$SESSION_ID" ]; then
  cat >&2 <<'EOF'
⛔ ExitPlanMode をブロックしました。

session_id を取得できませんでした。チェックポイントを検証できないためブロックします。
手順:
  1. AskUserQuestion で「Codex plan review を実行しますか？」とユーザーに確認
  2. 承認 → /codex-plan-review を実行し、結果をプランに反映
  3. スキップ → プランに「Codex レビュー: ユーザーによりスキップ」と記録
  4. フラグ設定: touch ~/.claude/sessions/career_compass/codex-plan-checkpoint-manual
  5. AskUserQuestion で「この実装を Codex に委譲しますか？」とユーザーに確認
  6. 回答をプランに記録し delegation フラグ設定:
     echo "<decision>" > ~/.claude/sessions/career_compass/codex-delegation-checkpoint-manual
     (<decision> = delegate / no-delegate / partial)
  7. 再度 ExitPlanMode を呼ぶ
EOF
  exit 2
fi

STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"
PLAN_FLAG="$STATE_DIR/codex-plan-checkpoint-$SESSION_ID"
DELEGATION_FLAG="$STATE_DIR/codex-delegation-checkpoint-$SESSION_ID"

# --- Check 1: Plan review checkpoint ---
if [ ! -f "$PLAN_FLAG" ]; then
  cat >&2 <<EOF
⛔ ExitPlanMode をブロックしました。

CLAUDE.md §A Step 1-3: Codex plan review チェックポイントが未設定です。

手順:
  1. AskUserQuestion で「Codex plan review を実行しますか？」とユーザーに確認
  2. 承認 → /codex-plan-review を実行し、結果をプランに反映
  3. スキップ → プランに「Codex レビュー: ユーザーによりスキップ」と記録
  4. フラグ設定: touch $PLAN_FLAG
  5. 次に delegation decision (Step 5-6) へ進む
EOF
  exit 2
fi

# --- Check 2: Delegation decision checkpoint ---
if [ ! -f "$DELEGATION_FLAG" ]; then
  cat >&2 <<EOF
⛔ ExitPlanMode をブロックしました。

CLAUDE.md §A Step 5-6: 実装委譲の判断チェックポイントが未設定です。

手順:
  1. AskUserQuestion で「この実装を Codex に委譲しますか？」とユーザーに確認
     以下の情報を提示すること:
       a. 委譲スコープ（変更対象ファイル一覧・推定変更行数）
       b. 推奨 Codex エージェント（.codex/agents/*.toml から最適なもの）
       c. コンテキスト準備計画（Section C-4 のどの要素を含めるか）
       d. 推定所要時間（小: ~5min, 中: ~15min, 大: ~30min）
       e. 委譲戦略オプション（一括 vs 分割）
  2. ユーザーの回答をプランに記録:
     - 委譲する → スコープ・エージェント・コンテキスト計画を記録
     - 委譲しない → 「Codex 委譲: ユーザーにより見送り」と記録
     - 一部のみ → 委譲範囲と Claude 実装範囲を記録
  3. フラグ設定: echo "<decision>" > $DELEGATION_FLAG
     (<decision> = delegate / no-delegate / partial)
  4. 再度 ExitPlanMode を呼ぶ
EOF
  exit 2
fi

# --- Check 3: 時間順序 (delegation は plan より後に作成されていること) ---
PLAN_MTIME=$(stat -f %m "$PLAN_FLAG" 2>/dev/null || echo 0)
DELEG_MTIME=$(stat -f %m "$DELEGATION_FLAG" 2>/dev/null || echo 0)
if [ "$DELEG_MTIME" -le "$PLAN_MTIME" ]; then
  cat >&2 <<EOF
⛔ ExitPlanMode をブロックしました。

delegation checkpoint が plan checkpoint より古いか同時刻です。
CLAUDE.md §A Step 5-6 の AskUserQuestion が省略された可能性があります。

plan_mtime=$PLAN_MTIME, delegation_mtime=$DELEG_MTIME

手順: 削除して AskUserQuestion 経由で作り直してください:
  rm $DELEGATION_FLAG
  # (Step 5) AskUserQuestion で委譲判断を確認
  echo "<decision>" > $DELEGATION_FLAG
EOF
  exit 2
fi

# --- Check 4: 最低時間差 3 秒 (バッチ作成検知) ---
GAP=$((DELEG_MTIME - PLAN_MTIME))
if [ "$GAP" -lt 3 ]; then
  cat >&2 <<EOF
⛔ ExitPlanMode をブロックしました。

plan / delegation checkpoint が ${GAP} 秒以内に連続作成されています (閾値: 3 秒)。
AskUserQuestion を経由せずバッチ作成された疑いがあります。

手順: 削除して AskUserQuestion 経由で作り直してください:
  rm $DELEGATION_FLAG
  # (Step 5) AskUserQuestion で委譲判断を確認
  echo "<decision>" > $DELEGATION_FLAG
EOF
  exit 2
fi

# --- Check 5: delegation 内容フォーマット ---
DELEG_CONTENT=$(tr -d '[:space:]' < "$DELEGATION_FLAG" 2>/dev/null || echo "")
case "$DELEG_CONTENT" in
  delegate|no-delegate|partial) ;;
  *)
    cat >&2 <<EOF
⛔ ExitPlanMode をブロックしました。

delegation checkpoint の内容が不正: "$DELEG_CONTENT"
許可値: delegate / no-delegate / partial

手順:
  echo "<decision>" > $DELEGATION_FLAG
  (<decision> = delegate / no-delegate / partial)
EOF
    exit 2
    ;;
esac

# Both checkpoints satisfied
exit 0
