#!/bin/bash
# PreToolUse (Edit|Write): その場しのぎのコードパターンを検出し、ユーザー確認を強制する。
# 新規追加パターンのみ検出（Edit: new_string にあって old_string にないもの）。
set -euo pipefail

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$SESSION_ID" ] || [ -z "$FILE_PATH" ]; then
  exit 0
fi

# --- 非コードファイルはスキップ ---
case "$FILE_PATH" in
  *.md|*.txt|*.json|*.yml|*.yaml|*.toml|*.csv|*.svg|*.html|*.css|*.lock)
    exit 0
    ;;
esac

# --- 承認済みチェック ---
STATE_DIR="$HOME/.claude/sessions/career_compass"
APPROVED_FILE="$STATE_DIR/bandaid-approved-$SESSION_ID"
if [ -f "$APPROVED_FILE" ] && grep -qxF "$FILE_PATH" "$APPROVED_FILE" 2>/dev/null; then
  exit 0
fi

# --- テストファイル判定 ---
IS_TEST_FILE=false
case "$FILE_PATH" in
  *.test.*|*.spec.*|*/e2e/*|*/backend/tests/*) IS_TEST_FILE=true ;;
esac

# --- 検査対象テキスト抽出 ---
if [ "$TOOL_NAME" = "Edit" ]; then
  NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
  OLD_STRING=$(echo "$INPUT" | jq -r '.tool_input.old_string // empty')
elif [ "$TOOL_NAME" = "Write" ]; then
  NEW_STRING=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
  OLD_STRING=""
else
  exit 0
fi

if [ -z "$NEW_STRING" ]; then
  exit 0
fi

# --- パターン検出 ---
FOUND=()

check_pattern() {
  local label="$1"
  local regex="$2"
  local test_exempt="$3"

  if [ "$test_exempt" = "yes" ] && [ "$IS_TEST_FILE" = "true" ]; then
    return
  fi

  if printf '%s' "$NEW_STRING" | grep -qE "$regex"; then
    if [ -z "$OLD_STRING" ] || ! printf '%s' "$OLD_STRING" | grep -qE "$regex"; then
      FOUND+=("$label")
    fi
  fi
}

check_pattern "@ts-ignore (型チェック抑制)"         "@ts-ignore"                              "no"
check_pattern "@ts-expect-error (型チェック抑制)"    "@ts-expect-error"                        "yes"
check_pattern "as any (型安全性バイパス)"            '\bas[[:space:]]+any\b'                    "no"
check_pattern "as unknown (型安全性バイパス)"        '\bas[[:space:]]+unknown\b'                "no"
check_pattern "空の catch ブロック (エラー握りつぶし)" 'catch[[:space:]]*\([^)]*\)[[:space:]]*\{[[:space:]]*\}' "no"
check_pattern "jest.mock / vi.mock (テスト外モック)" '(jest|vi)\.mock\('                        "yes"
check_pattern ".skip / .only (テスト迂回)"          '\.(skip|only)\('                          "no"
check_pattern "xit / xdescribe (テスト迂回)"        '\bx(it|describe)\('                       "no"
check_pattern "TODO/FIXME/HACK コメント"            '//[[:space:]]*(TODO|FIXME|HACK)'          "no"
check_pattern "console.log (デバッグ出力)"          'console\.(log|warn|error|debug)\('        "no"

if [ ${#FOUND[@]} -eq 0 ]; then
  exit 0
fi

# --- ブロック ---
PATTERN_LIST=""
for p in "${FOUND[@]}"; do
  PATTERN_LIST="$PATTERN_LIST  - $p
"
done

cat >&2 <<EOF
⛔ Band-aid パターンを検出しました。

ファイル: ${FILE_PATH}
検出パターン:
${PATTERN_LIST}
その場しのぎの修正は、根本原因の解決を妨げる可能性があります。

手順:
  1. AskUserQuestion でユーザーに確認:
     - 検出パターンと、そのパターンを使う理由を提示
     - 「許可する」「根本的に修正する」の選択肢を出す
  2. 許可 → echo "${FILE_PATH}" >> $APPROVED_FILE
  3. 修正 → パターンを除去して再度 Edit/Write
  4. 再度 Edit/Write を実行
EOF
exit 2
