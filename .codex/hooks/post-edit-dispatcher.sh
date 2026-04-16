#!/bin/bash
# Codex wrapper for path-aware post-edit reminders.
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */backend/app/prompts/*|*/backend/app/utils/llm*.py)
    cat >&2 <<'EOF'
🧪 prompt / LLM ファイルを変更しました。Codex では `pytest` と `ai-writing-auditor` の併用を推奨します。
EOF
    ;;
esac

case "$FILE_PATH" in
  *.ts|*.tsx|*.py)
    STATE_DIR="$HOME/.codex/sessions/career_compass"
    mkdir -p "$STATE_DIR"
    COUNTER_FILE="$STATE_DIR/edit-count-$SESSION_ID"
    COUNT=$(python3 - <<'PY' "$COUNTER_FILE"
from pathlib import Path
import sys
path = Path(sys.argv[1])
try:
    print(path.read_text(encoding="utf-8").strip() or "0")
except FileNotFoundError:
    print("0")
PY
)
    COUNT=$((COUNT + 1))
    printf '%s\n' "$COUNT" > "$COUNTER_FILE"
    if [ $((COUNT % 5)) -eq 0 ]; then
      cat >&2 <<EOF
🧹 TS/TSX/PY 編集 ${COUNT} 回目です。dead code、巨大ファイル、未使用 import を点検してください。
EOF
    fi
    ;;
esac

if echo "$FILE_PATH" | grep -qE '(^|/)src/lib/db/schema\.ts$'; then
  cat >&2 <<'EOF'
🗄️ schema.ts を変更しました。`npm run db:generate` と migration SQL レビューを忘れないでください。
EOF
fi

exit 0
