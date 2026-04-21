#!/bin/bash
# Stop: plain-text で commit/push/E2E の確認を出した状態で停止しようとしたら block。
# CLAUDE.md「User Confirmation Rules」と memory feedback_no_plaintext_questions を
# 機械的に enforce する。判定条件: トピック語 + 確認/保留語の両方を含む場合のみ block。
set -euo pipefail

INPUT=$(cat)

# Claude Code が block からの再起動中は stop_hook_active=true。ループ防止のため即 pass。
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# 最後の assistant メッセージの text を抽出。
# transcript は JSONL で、各行のフォーマットが 2 系統あり得るので両対応:
#   1) { "type":"assistant", "message": { "content": [ { "type":"text", "text":"..." } ] } }
#   2) { "role":"assistant", "content": [ { "type":"text", "text":"..." } ] }
LAST_TEXT=$(jq -r -s '
  map(select((.type // .role // "") == "assistant"))
  | if length == 0 then empty else last end
  | (.message.content // .content // [])
  | if type == "string" then .
    else map(select(.type == "text") | .text // "") | join("\n")
    end
' "$TRANSCRIPT_PATH" 2>/dev/null || true)

if [ -z "$LAST_TEXT" ]; then
  exit 0
fi

# --- パターン判定 ---
TOPIC_RE='(コミット|commit|push|プッシュ|E2E|e2e|テスト実行|ステージング|staging|デプロイ|deploy|リリース|release)'
CONFIRM_RE='(しますか[？?]|ますか[？?]|してもいい|進めますか|どうしますか|指示があれば|未完了|お知らせください|ご確認|よろしいですか|実行します。)'

if ! printf '%s' "$LAST_TEXT" | grep -qE "$TOPIC_RE"; then
  exit 0
fi
if ! printf '%s' "$LAST_TEXT" | grep -qE "$CONFIRM_RE"; then
  exit 0
fi

# --- マッチ: Stop を block して AskUserQuestion へ誘導 ---
REASON='🚫 Stop blocked: commit/push/E2E 関連の plain-text 確認を検知しました。

CLAUDE.md「User Confirmation Rules」および memory feedback_no_plaintext_questions により、
Yes/No の判断は必ず AskUserQuestion ツールで行う必要があります。

今すぐ AskUserQuestion で同じ内容を再提示してください。plain text で聞き直さないこと。

例:
  question: "変更をコミットしますか？ (push は別途確認します)"
  options:
    - label: "コミットする"
    - label: "まだ待つ"'

jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'
exit 0
