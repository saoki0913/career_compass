#!/bin/bash
# PreToolUse(Bash): `git commit` を検出し、大規模変更時に
# post_review + delegation 確認 (CLAUDE.md §B) を機械的に強制する。
# checkpoint が未設定 / 不正 / stale のいずれかならブロック。
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=lib/skill-recommender.sh
. "$PROJECT_DIR/.claude/hooks/lib/skill-recommender.sh"
# shellcheck source=../../scripts/harness/guard-runtime.sh
. "$PROJECT_DIR/scripts/harness/guard-runtime.sh"
GR_HOOK=commit-codex-gate

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

# Bash 呼び出しでない / command が空 → 素通り
if [ -z "$CMD" ]; then
  exit 0
fi

# `git commit` を含まないコマンドは素通り
if ! echo "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit'; then
  exit 0
fi

if echo "$CMD" | grep -qE '(^|[;&|][[:space:]]*)git[[:space:]]+add[[:space:]].*&&[[:space:]]*git[[:space:]]+commit'; then
  cat >&2 <<'EOF'
⛔ git commit をブロックしました。

git add と git commit を同じ Bash コマンドにまとめると、PreToolUse 時点の staged diff と
実際の commit 対象がずれる可能性があります。
先に git add を単独実行し、Codex post_review / checkpoint を作成してから git commit してください。
EOF
  exit 2
fi

# フラグトークン（単一ダッシュで 'a' を含む / --all）のみを検出。message
# 値（`-m "...a..."`）や `--amend` を誤検出していた旧 substring regex を修正。
if echo "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit([^;&|]*[[:space:]])?(-[A-Za-z]*a[A-Za-z]*|--all)([[:space:]=;&|]|$)'; then
  cat >&2 <<'EOF'
⛔ git commit をブロックしました。

git commit -a / -am / --all は staged diff review をすり抜ける可能性があります。
対象ファイルを明示的に git add し、Codex post_review / checkpoint を作成してから git commit してください。
EOF
  exit 2
fi

gr_init "$INPUT" claude
STATE_DIR="$HOME/.claude/sessions/career_compass"
mkdir -p "$STATE_DIR"

# --- prompt / LLM quality verification (high severity; SSOT-unified with
#     the Codex side so the definition is symmetric).
STAGED_NAMES=$(git -C "$PROJECT_DIR" diff --cached --name-only --diff-filter=ACMRD 2>/dev/null || true)
if printf '%s\n' "$STAGED_NAMES" | grep -qE '^(backend/app/prompts/|backend/app/utils/llm[^/]*\.py$)'; then
  PQ_OK=0
  if [ -n "$SESSION_ID" ]; then
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
  node scripts/harness/diff-snapshot.mjs checkpoint --kind prompt-quality-verification --decision verified --project \"$PROJECT_DIR\" > \"$STATE_DIR/prompt-quality-verification-${SESSION_ID:-<session>}\"
/codex:review・CI prompt-structure テスト・pre-commit も併用してください。"
  fi
fi

# --- 変更統計を取得 (staged diff only) ---
NUMSTAT=$(git -C "$PROJECT_DIR" diff --cached --numstat 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
TOTAL_FILES=$CHANGED_FILES
TOTAL_LINES=$(printf '%s\n' "$NUMSTAT" | awk '$1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {sum += $1 + $2} END {print sum+0}')

HOTSPOT_HIT=""
ALL_PATHS=$(printf '%s\n' "$NUMSTAT" | awk 'NF {print $NF}')
while IFS= read -r path; do
  [ -z "$path" ] && continue
  if is_hotspot_path "$path"; then
    HOTSPOT_HIT="$path"
    break
  fi
done <<< "$ALL_PATHS"

# --- 閾値未満なら素通り (SSOT: lib/skill-recommender.sh) ---
if ! is_codex_post_review_candidate "$TOTAL_FILES" "$TOTAL_LINES" "$HOTSPOT_HIT"; then
  exit 0
fi

# --- large / hotspot post-review (high severity) ---
# The good path (a valid commit-review checkpoint already exists) stays a
# SILENT exit 0. Otherwise block until the staged diff has a review-bound
# checkpoint. The git add&&commit / `git commit -a` integrity arms above
# stay exit 2 (deterministic correctness, not bypassable).
COMMIT_DELEG_FLAG="$STATE_DIR/codex-commit-delegation-$SESSION_ID"
CR_OK=0
if [ -n "$SESSION_ID" ] && [ -f "$COMMIT_DELEG_FLAG" ] \
  && printf '%s' "$(jq -r '.kind // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")" | grep -qE '^(commit-review|codex-post-review)$' \
  && printf '%s' "$(jq -r '.decision // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")" | grep -qE '^(reviewed-proceed|delegate-fixes|fallback-reviewed|plugin-reviewed)$' \
  && node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$COMMIT_DELEG_FLAG" >/dev/null 2>&1; then
  CR_OK=1
fi
if [ "$CR_OK" != 1 ]; then
  gr_enforce high "変更が大きい / 重要ファイルを含みます。
検出: files=$TOTAL_FILES, lines=$TOTAL_LINES${HOTSPOT_HIT:+, hotspot=$HOTSPOT_HIT}
コミット前に bash scripts/codex/delegate.sh post_review（または /codex:review）を実行し、staged diff に結び付いた checkpoint を記録してください。"
fi

# All checks passed
exit 0
