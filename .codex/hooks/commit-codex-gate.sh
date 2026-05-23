#!/bin/bash
# PreToolUse (Bash): require Codex post_review checkpoint before large commits.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"
# shellcheck source=lib/autonomy.sh
. "$SCRIPT_DIR/lib/autonomy.sh"

PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/hook-shared.sh
. "$PROJECT_DIR/scripts/harness/hook-shared.sh"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"
# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=commit-codex-gate
gr_init "$INPUT" codex

CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

if [ -z "$CMD" ]; then
  exit 0
fi

if ! guard_command_is_git_commit "$CMD"; then
  exit 0
fi

if printf '%s' "$CMD" | grep -qE '(^|[;&|][[:space:]]*)git[[:space:]]+add[[:space:]].*([;&|]{1,2})[[:space:]]*git[[:space:]]+commit'; then
  echo "大きなコミットでは、ファイル追加とコミットを別々に実行してください。レビュー確認の対象を固定するためです。" >&2
  exit 2
fi

# `git commit -a / -am / --all` は staged review をすり抜ける。フラグ
# トークン（単一ダッシュで 'a' を含む / --all）のみを検出する。message
# 値（`-m "...a..."`）や `--amend` を誤検出していた旧 substring regex を修正。
if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit([^;&|]*[[:space:]])?(-[A-Za-z]*a[A-Za-z]*|--all|--amend)([[:space:]=;&|]|$)'; then
  echo "大きなコミットでは、先に対象ファイルを明示してからコミットしてください。" >&2
  exit 2
fi

NUMSTAT=$(git -C "$PROJECT_DIR" diff --cached --numstat 2>/dev/null || true)
STAGED_NAMES=$(git -C "$PROJECT_DIR" diff --cached --name-only --diff-filter=ACMRD 2>/dev/null || true)

STATE_DIR=""
AUTONOMY_COMMIT_OK=0
if [ -n "$SESSION_ID" ]; then
  STATE_DIR=$(codex_session_state_dir)
  if codex_autonomy_allows_action "$PROJECT_DIR" "$STATE_DIR" "$SESSION_ID" "commit" "$CMD"; then
    AUTONOMY_COMMIT_OK=1
  fi
fi

# Prompt-quality and large/hotspot commit review are high-severity gates.
# Commits are reversible, but bypassing the review checkpoint makes staged
# diff validation and the blocking reviewer contract unenforceable.

# --- prompt / LLM quality verification (advisory) ---
if printf '%s\n' "$STAGED_NAMES" | grep -qE '^(backend/app/prompts/|backend/app/utils/llm[^/]*\.py$)'; then
  PQ_OK=0
  if [ -n "$STATE_DIR" ]; then
    PROMPT_QUALITY_FLAG="$STATE_DIR/prompt-quality-verification-$SESSION_ID"
    if [ -f "$PROMPT_QUALITY_FLAG" ] \
      && [ "$(jq -r '.kind // empty' "$PROMPT_QUALITY_FLAG" 2>/dev/null || echo "")" = "prompt-quality-verification" ] \
      && [ "$(jq -r '.decision // empty' "$PROMPT_QUALITY_FLAG" 2>/dev/null || echo "")" = "verified" ] \
      && node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$PROMPT_QUALITY_FLAG" >/dev/null 2>&1; then
      PQ_OK=1
    fi
  fi
  if [ "$PQ_OK" != 1 ]; then
    gr_enforce high "プロンプト/LLM 基盤が staged されています。
コミット前に prompt quality verification を記録してください:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind prompt-quality-verification --decision verified --project \"$PROJECT_DIR\" > \"${STATE_DIR:-<state-dir>}/prompt-quality-verification-${SESSION_ID:-<session>}\"
/codex:review・CI prompt-structure テスト・pre-commit も併用してください。"
  fi
fi

if [ "$AUTONOMY_COMMIT_OK" = 1 ] && [ -n "$STATE_DIR" ]; then
  node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" checkpoint \
    --kind test-categories \
    --decision approved \
    --issuer codex-autonomy \
    --project "$PROJECT_DIR" \
    --categories "e2e-functional=skip:all,quality=skip,static=run,security=run" \
    > "$STATE_DIR/test-categories-$SESSION_ID"
fi

# --- large / hotspot post-review (advisory) ---
CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')
HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n' "$NUMSTAT" | awk 'NF {print $NF}')
while IFS= read -r changed_path; do
  [ -z "$changed_path" ] && continue
  if is_hotspot_path "$changed_path"; then
    HOTSPOT_HIT="$changed_path"
    break
  fi
done <<< "$ALL_PATHS"

if is_codex_post_review_candidate "$CHANGED_FILES" "$TOTAL_LINES" "$HOTSPOT_HIT"; then
  CR_OK=0
  if [ -n "$STATE_DIR" ]; then
    COMMIT_DELEG_FLAG="$STATE_DIR/codex-commit-delegation-$SESSION_ID"
    if [ -f "$COMMIT_DELEG_FLAG" ] \
      && [ "$(jq -r '.kind // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")" = "commit-review" ] \
      && printf '%s' "$(jq -r '.decision // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")" | grep -qE '^(reviewed-proceed|delegate-fixes|fallback-reviewed|plugin-reviewed|codex-autonomy-local-commit)$' \
      && node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$COMMIT_DELEG_FLAG" >/dev/null 2>&1; then
      CR_OK=1
    fi
  fi
  if [ "$CR_OK" != 1 ] && [ "$AUTONOMY_COMMIT_OK" = 1 ] && [ -n "$STATE_DIR" ]; then
    COMMIT_DELEG_FLAG="$STATE_DIR/codex-commit-delegation-$SESSION_ID"
    node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" checkpoint \
      --kind commit-review \
      --decision codex-autonomy-local-commit \
      --issuer codex-autonomy \
      --project "$PROJECT_DIR" \
      --command "$CMD" \
      > "$COMMIT_DELEG_FLAG"
    if node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$COMMIT_DELEG_FLAG" >/dev/null 2>&1; then
      CR_OK=1
    fi
  fi
  if [ "$CR_OK" != 1 ]; then
    gr_enforce high "変更が大きい / 重要ファイルを含みます。
検出: files=${CHANGED_FILES} lines=${TOTAL_LINES}${HOTSPOT_HIT:+ hotspot=${HOTSPOT_HIT}}
コミット前に bash scripts/codex/delegate.sh post_review（または /codex:review）を実行し、staged diff に結び付いた checkpoint を記録してください。"
  fi
fi

exit 0
