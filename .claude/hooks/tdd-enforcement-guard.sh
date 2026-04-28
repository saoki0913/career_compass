#!/bin/bash
# PreToolUse (Edit|Write): TDD enforcement — テスト先行開発を強制する。
# 実装ファイルを編集する前に、対応テストファイルの存在と更新を検証。
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../../.codex/hooks/lib/codex-hook-utils.sh
. "$HOOK_DIR/../../.codex/hooks/lib/codex-hook-utils.sh"
if [ -z "$FILE_PATH" ]; then
  FILE_PATH=$(codex_primary_file_path "$INPUT")
fi

if [ -z "$FILE_PATH" ]; then exit 0; fi

REL_PATH="${FILE_PATH#$REPO_ROOT/}"

record_tdd_edit() {
  if [ -z "$SESSION_ID" ]; then
    return
  fi

  STATE_DIR="$HOME/.claude/sessions/career_compass"
  mkdir -p "$STATE_DIR"
  TDD_LOG="$STATE_DIR/tdd-edits-$SESSION_ID"
  echo "$(date +%s) $REL_PATH" >> "$TDD_LOG"
}

# --- Exemptions: files that don't need test-first ---
# Config files
if echo "$REL_PATH" | grep -qE '\.(config|d)\.(ts|mjs|js)$'; then exit 0; fi
if echo "$REL_PATH" | grep -qE '^(next|tailwind|postcss|vitest|playwright)\.'; then exit 0; fi
# Documentation
if echo "$REL_PATH" | grep -qE '\.(md|mdx|css|json)$'; then exit 0; fi
# Schema / migrations
if echo "$REL_PATH" | grep -qE '(schema\.ts|drizzle_pg/)'; then exit 0; fi
# Test infrastructure
if echo "$REL_PATH" | grep -qE '^e2e/(fixtures|helpers)/'; then exit 0; fi
# Hook / tool config
if echo "$REL_PATH" | grep -qE '^\.claude/|^\.codex/|^\.kiro/|^\.github/|^scripts/|^security/|^docs/|^tools/'; then exit 0; fi
# Test edits establish the session proof required before implementation edits.
if echo "$REL_PATH" | grep -qE '\.(test|spec)\.(ts|tsx|py)$|^backend/tests/'; then
  record_tdd_edit
  exit 0
fi
# Makefile / package.json / lock files
if echo "$REL_PATH" | grep -qE '^(Makefile|package\.json|package-lock\.json|tsconfig)'; then exit 0; fi
# Python __init__.py
if echo "$REL_PATH" | grep -qE '__init__\.py$'; then exit 0; fi
# Type definitions
if echo "$REL_PATH" | grep -qE '\.d\.ts$'; then exit 0; fi
# Backend prompts (covered by prompt-engineer, not unit tests)
if echo "$REL_PATH" | grep -qE '^backend/app/prompts/'; then exit 0; fi

# --- Resolve expected test file ---
TEST_FILE=""

if echo "$REL_PATH" | grep -qE '^src/.*\.(ts|tsx)$'; then
  # Frontend: src/foo/Bar.tsx -> src/foo/Bar.test.tsx or src/foo/Bar.test.ts
  BASE="${REL_PATH%.*}"
  EXT="${REL_PATH##*.}"
  TEST_FILE_TSX="$REPO_ROOT/${BASE}.test.${EXT}"
  TEST_FILE_TS="$REPO_ROOT/${BASE}.test.ts"
  if [ -f "$TEST_FILE_TSX" ]; then
    TEST_FILE="$TEST_FILE_TSX"
  elif [ -f "$TEST_FILE_TS" ]; then
    TEST_FILE="$TEST_FILE_TS"
  fi
elif echo "$REL_PATH" | grep -qE '^backend/app/.*\.py$'; then
  # Backend: backend/app/routers/foo.py -> backend/tests/*/test_foo*.py
  BASENAME=$(basename "$REL_PATH" .py)
  TEST_FILE=$(find "$REPO_ROOT/backend/tests" -name "test_${BASENAME}*.py" -type f 2>/dev/null | head -1 || true)
fi

if [ -z "$TEST_FILE" ]; then
  if echo "$REL_PATH" | grep -qE '^src/.*\.(ts|tsx)$|^backend/app/.*\.py$'; then
    if echo "$REL_PATH" | grep -qE '^src/'; then
      EXPECTED="${REL_PATH%.*}.test.${REL_PATH##*.}"
    else
      EXPECTED="backend/tests/*/test_$(basename "$REL_PATH" .py)*.py"
    fi
    cat >&2 <<EOF
TDD: テストファイルが見つかりません。先にテストを作成してください。

  編集対象: $REL_PATH
  期待パス: $EXPECTED

テスト先行開発(TDD)が有効です。実装コードを編集する前に、
対応するテストファイルを作成・更新してください。
EOF
    exit 2
  fi
  exit 0
fi

# --- Check if test was edited in this session ---
if [ -n "$SESSION_ID" ]; then
  STATE_DIR="$HOME/.claude/sessions/career_compass"
  mkdir -p "$STATE_DIR"
  TDD_LOG="$STATE_DIR/tdd-edits-$SESSION_ID"

  # Check if the test file was edited before this implementation file
  REL_TEST="${TEST_FILE#$REPO_ROOT/}"
  if ! grep -qF " $REL_TEST" "$TDD_LOG" 2>/dev/null; then
    cat >&2 <<EOF
TDD: テスト ($REL_TEST) がこのセッションで未更新です。
実装コードを編集する前に、対応するテストを先に更新してください。
EOF
    exit 2
  fi

  echo "$(date +%s) $REL_PATH" >> "$TDD_LOG"
fi

exit 0
