#!/bin/bash
# PostToolUse (Edit|Write): path-aware reminders for prompts, maintainability, schema, and tests.
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  */backend/app/prompts/*|*/backend/app/utils/llm*.py)
    cat >&2 <<'EOF'
🧪 prompt / LLM ファイルを変更しました。commit 前に以下を推奨します:

  1. 構造テスト:
     cd backend && pytest tests/es_review/ -k grounding -x --tb=short
     cd backend && pytest tests/es_review/test_es_review_prompt_structure.py -x
     cd backend && pytest tests/interview/test_interview_prompt_shapes.py -x

  2. 参考 ES 漏洩チェック:
     - 生成物に参考 ES の原文が含まれていないこと（統計プロファイルのみ許可）
     - ai-writing-auditor skill で AI 臭チェック

  3. 品質 eval（存在すれば）:
     python backend/evals/es_review_smoke.py

変更内容次第では prompt-engineer agent への委譲を推奨します。
EOF
    ;;
esac

case "$FILE_PATH" in
  *.ts|*.tsx|*.py)
    STATE_DIR="$HOME/.claude/sessions/career_compass"
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
🧹 AI コーディング保守性チェック（この session で TS/TSX/PY 編集 ${COUNT} 回目）:

  - 未使用 import / 到達不能コード / 空 helper / 冗長 type / 古いコメントを確認
  - built-in の /simplify skill で 3 つの review agent 並列検出 → 自動 fix
  - 500 行超ファイルに変更を追加した場合は code-reviewer agent へ委譲
  - 新規 file を作る前に "既存ファイルの編集で済むか" を再考（CLAUDE.md）

dead code を残したまま commit しないこと。
EOF
    fi
    ;;
esac

if echo "$FILE_PATH" | grep -qE '(^|/)src/lib/db/schema\.ts$'; then
  cat >&2 <<'EOF'
🗄️ schema.ts を変更しました。以下を忘れずに:

  1. マイグレーション生成: npm run db:generate
  2. SQL レビュー: drizzle_pg/ の最新ファイルを確認
  3. onDelete / CASCADE を明示的に設定（デフォルトに依存しない）
  4. Python 側影響: backend/app/ で同じテーブルを参照するクエリを確認
  5. database-engineer agent への委譲を推奨
EOF
fi

if echo "$FILE_PATH" | grep -qE '\.(test|spec)\.(ts|tsx)$' && ! echo "$FILE_PATH" | grep -qE '(^|/)e2e/'; then
  cat >&2 <<EOF
🧪 Vitest テストファイルを変更しました。実行を推奨:
  npm run test:unit -- --run ${FILE_PATH}
EOF
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)e2e/.*\.spec\.ts$'; then
  cat >&2 <<EOF
🧪 Playwright E2E テストを変更しました。実行を推奨:
  npm run test:e2e -- ${FILE_PATH}
EOF
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)backend/tests/.*\.py$'; then
  cat >&2 <<EOF
🧪 pytest テストファイルを変更しました。実行を推奨:
  cd backend && pytest ${FILE_PATH} -x --tb=short
EOF
fi

exit 0
