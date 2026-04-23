#!/bin/bash
# PostToolUse (Edit|Write): path-aware reminders for prompts, maintainability, schema, and tests.
set -euo pipefail
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# shellcheck source=lib/skill-recommender.sh
. "$(dirname "$0")/lib/skill-recommender.sh"
# shellcheck source=lib/e2e-functional-reminder.sh
. "$(dirname "$0")/lib/e2e-functional-reminder.sh"

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

maybe_emit_e2e_functional_reminder "$FILE_PATH" "$SESSION_ID" "claude"

node "$PROJECT_DIR/tools/mark-verification-stale.mjs" --file="$FILE_PATH" --session="$SESSION_ID" --agent=claude >/dev/null 2>&1 || true

# ─────────────────────────────────────────────────────────────
# hotspot ファイル編集 — 1 回でも触れたら即推奨
# ─────────────────────────────────────────────────────────────
if is_hotspot_path "$FILE_PATH"; then
  cat >&2 <<EOF
🔥 hotspot ファイルを編集しました: ${FILE_PATH}
   （docs/ops/AI_DEVELOPMENT_PRINCIPLES.md 列挙の負債集中ポイント）

   推奨アクション:
     1. 継ぎ足し追記なら refactoring-specialist skill で分離可否を先に判定
     2. session 終了前に maintainability-review skill で影響範囲を確認
     3. commit 前に code-reviewer skill で OWASP / 重複ロジック / dead code チェック

EOF
fi

# ─────────────────────────────────────────────────────────────
# 500 行超ファイルへの追記 — 責務肥大化のシグナル
# ─────────────────────────────────────────────────────────────
case "$FILE_PATH" in
  *.ts|*.tsx|*.py)
    if is_oversized_file "$FILE_PATH" 500; then
      LINES=$(file_line_count "$FILE_PATH")
      cat >&2 <<EOF
⚠️ 500 行超ファイルに追記しました: ${FILE_PATH} (現在 ${LINES} 行)

   推奨アクション:
     - 新責務を追加したなら refactoring-specialist skill で分離計画を作る
     - architecture-gate skill で分離前 / 後の境界を確認
     - 「とりあえず動く」より「後から直しやすい」を優先（AI_DEVELOPMENT_PRINCIPLES.md）

EOF
    fi
    ;;
esac

# ─────────────────────────────────────────────────────────────
# src/app/api/ と backend/app/ の横断変更 — 境界変更のシグナル
# ─────────────────────────────────────────────────────────────
CROSS_DIR=$(skill_session_state_dir)
NEXT_API_FLAG="$CROSS_DIR/edited-next-api-${SESSION_ID}"
FASTAPI_FLAG="$CROSS_DIR/edited-fastapi-${SESSION_ID}"
CROSS_NOTIFIED_FLAG="$CROSS_DIR/cross-notified-${SESSION_ID}"

case "$FILE_PATH" in
  */src/app/api/*)
    skill_touch_flag "$NEXT_API_FLAG"
    ;;
  */backend/app/*)
    skill_touch_flag "$FASTAPI_FLAG"
    ;;
esac

if [ -f "$NEXT_API_FLAG" ] && [ -f "$FASTAPI_FLAG" ] && [ ! -f "$CROSS_NOTIFIED_FLAG" ]; then
  skill_touch_flag "$CROSS_NOTIFIED_FLAG"
  cat >&2 <<'EOF'
🔀 src/app/api/ と backend/app/ の両方を 1 セッション内で編集しました（横断変更）。

   推奨アクション:
     - architect skill で境界 / 所有権 / データフローを整理
     - 重複ロジックがないか確認（同じ知識が両層に書かれていないか）
     - session 終了前に maintainability-review skill で全体整合を検証

EOF
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
