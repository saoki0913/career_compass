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

TOPIC_RE='(コミット|commit|push|プッシュ|E2E|e2e|テスト実行|ステージング|staging|デプロイ|deploy|リリース|release)'
CONFIRM_RE='(しますか[？?]|ますか[？?]|してもいい|進めますか|どうしますか|指示があれば|未完了|お知らせください|ご確認|よろしいですか|実行します。)'

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
