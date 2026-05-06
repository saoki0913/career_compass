#!/bin/bash
# Stop: continue if the final assistant message used plain-text confirmation for gated actions.
set -euo pipefail

INPUT=$(cat)

STOP_HOOK_ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  jq -n '{continue: true}'
  exit 0
fi

LAST_TEXT=$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || true)

if [ -z "$LAST_TEXT" ]; then
  TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || true)
  if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    LAST_TEXT=$(jq -r -s '
      map(select((.type // .role // "") == "assistant"))
      | if length == 0 then empty else last end
      | (.message.content // .content // [])
      | if type == "string" then .
        else map(select(.type == "text") | .text // "") | join("\n")
        end
    ' "$TRANSCRIPT_PATH" 2>/dev/null || true)
  fi
fi

if [ -z "$LAST_TEXT" ]; then
  jq -n '{continue: true}'
  exit 0
fi

# --- Topic words: gated actions that require AskUserQuestion ---
TOPIC_RE='(コミット|commit|push|プッシュ|E2E|e2e|テスト実行'
TOPIC_RE+='|ステージング|staging|デプロイ|deploy|リリース|release'
TOPIC_RE+='|マージ|merge|PR|pull.request|本番|production'
TOPIC_RE+='|削除|delete|リセット|reset|rebase|修正確認|実装確認)'

# --- Confirm/deferral phrases ---
CONFIRM_RE='(しますか|ますか|してもいい|進めますか|どうしますか'
CONFIRM_RE+='|指示があれば|未完了|お知らせください|ご確認ください'
CONFIRM_RE+='|よろしいですか|よろしいでしょうか|実行します。'
CONFIRM_RE+='|いかがでしょうか|いかがしましょう|しましょうか'
CONFIRM_RE+='|でいいですか|大丈夫ですか|いいでしょうか'
CONFIRM_RE+='|ご指示ください|お教えください|教えてください'
CONFIRM_RE+='|どうしましょう|お待ちしています'
CONFIRM_RE+='|必要であれば|必要に応じて'
CONFIRM_RE+='|進めてもらえますか|お願いします|お伝えください|問題なければ'
CONFIRM_RE+='|[Ss]hould I |[Ss]hall I |[Ww]ould you like|[Dd]o you want|[Ll]et me know)'

if ! printf '%s' "$LAST_TEXT" | grep -qE "$TOPIC_RE"; then
  jq -n '{continue: true}'
  exit 0
fi
if ! printf '%s' "$LAST_TEXT" | grep -qE "$CONFIRM_RE"; then
  jq -n '{continue: true}'
  exit 0
fi

REASON='Stop blocked: commit/push/E2E/deploy/release confirmation was phrased as plain text. Use the active user-confirmation mechanism instead of ending the turn.'
jq -n --arg reason "$REASON" '{decision: "block", reason: $reason}'
