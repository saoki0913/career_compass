#!/bin/bash
# PreToolUse (Bash): require Codex post_review checkpoint before large commits.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/hook-shared.sh
. "$PROJECT_DIR/scripts/harness/hook-shared.sh"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

CMD=$(codex_tool_command "$INPUT")
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

if [ -z "$CMD" ]; then
  exit 0
fi

if ! guard_command_is_git_commit "$CMD"; then
  exit 0
fi

if printf '%s' "$CMD" | grep -qE '(^|[;&|][[:space:]]*)git[[:space:]]+add[[:space:]].*&&[[:space:]]*git[[:space:]]+commit'; then
  echo "大きなコミットでは、ファイル追加とコミットを別々に実行してください。レビュー確認の対象を固定するためです。" >&2
  exit 2
fi

if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit([^;&|]*[[:space:]])-[^;&|]*a'; then
  echo "大きなコミットでは、先に対象ファイルを明示してからコミットしてください。" >&2
  exit 2
fi

NUMSTAT=$(git -C "$PROJECT_DIR" diff --cached --numstat 2>/dev/null || true)

CHANGED_FILES=$(printf '%s\n' "$NUMSTAT" | grep -cE '.' || true)
TOTAL_FILES=$CHANGED_FILES
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

if ! is_codex_post_review_candidate "$TOTAL_FILES" "$TOTAL_LINES" "$HOTSPOT_HIT"; then
  exit 0
fi

if [ -z "$SESSION_ID" ]; then
  echo "コミット前レビューの確認状態を読み取れないため、実行できませんでした。" >&2
  exit 2
fi

STATE_DIR=$(codex_session_state_dir)
COMMIT_DELEG_FLAG="$STATE_DIR/codex-commit-delegation-$SESSION_ID"

if [ ! -f "$COMMIT_DELEG_FLAG" ]; then
  cat >&2 <<EOF
このコミットはまだ実行できません。

変更が大きい、または重要なファイルを含むため、コミット前にレビューが必要です。
検出結果: ファイル数 $TOTAL_FILES、変更行数 $TOTAL_LINES${HOTSPOT_HIT:+、重要ファイル $HOTSPOT_HIT}

先に実行する確認:
  bash scripts/codex/delegate.sh post_review

開発者向けの記録手順:
  node scripts/harness/diff-snapshot.mjs checkpoint --kind commit-review --decision reviewed-proceed --project "$PROJECT_DIR" \
    --review-request-id "<review.json requestId>" --review-execution-status SUCCESS \
    --review-verdict "<APPROVE|REQUEST_CHANGES>" --max-severity "<low|medium|high|critical>" > $COMMIT_DELEG_FLAG
EOF
  exit 2
fi

DECISION=$(jq -r '.decision // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
case "$DECISION" in
  reviewed-proceed|delegate-fixes|fallback-reviewed|plugin-reviewed) ;;
  *)
    cat >&2 <<EOF
コミット前レビューの判断内容を読み取れませんでした。
レビュー結果を確認し、続行できる判断を記録してから再実行してください。
EOF
    exit 2
    ;;
esac

if ! node "$PROJECT_DIR/scripts/harness/diff-snapshot.mjs" verify --project "$PROJECT_DIR" --file "$COMMIT_DELEG_FLAG" >/dev/null; then
  echo "レビュー確認後に差分が変わったため、コミット前レビューをもう一度確認してください。" >&2
  exit 2
fi

KIND=$(jq -r '.kind // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
if [ "$KIND" != "commit-review" ]; then
  echo "コミット前レビューの確認記録ではないため、続行できませんでした。" >&2
  exit 2
fi

if [ "$DECISION" != "fallback-reviewed" ] && [ "$DECISION" != "plugin-reviewed" ]; then
  REVIEW_REQUEST_ID=$(jq -r '.reviewRequestId // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  REVIEW_EXECUTION_STATUS=$(jq -r '.reviewExecutionStatus // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  REVIEW_VERDICT=$(jq -r '.reviewVerdict // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  MAX_SEVERITY=$(jq -r '.maxSeverity // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")

  if [ -z "$REVIEW_REQUEST_ID" ] || [ "$REVIEW_EXECUTION_STATUS" != "SUCCESS" ]; then
    echo "コミット前レビューが完了していないため、続行できませんでした。" >&2
    exit 2
  fi

  case "$REVIEW_VERDICT" in
    APPROVE) ;;
    REQUEST_CHANGES)
      case "$MAX_SEVERITY" in
        low|medium) ;;
        *)
          echo "レビューで重大な修正が必要と判断されたため、修正してからコミットしてください。" >&2
          exit 2
          ;;
      esac
      ;;
    *)
      echo "レビュー結果の判断が続行可能な状態ではありません。内容を確認してください。" >&2
      exit 2
      ;;
  esac

  REVIEW_JSON=""
  for dir in "$PROJECT_DIR/.codex/state/handoffs/$REVIEW_REQUEST_ID" "$PROJECT_DIR/.claude/state/codex-handoffs/$REVIEW_REQUEST_ID"; do
    if [ -f "$dir/review.json" ]; then
      REVIEW_JSON="$dir/review.json"
      break
    fi
  done

  if [ -z "$REVIEW_JSON" ]; then
    echo "対応するレビュー結果を見つけられませんでした。レビューをもう一度実行してください。" >&2
    exit 2
  fi

  CHECKPOINT_HASH=$(jq -r '.stagedDiffHash // empty' "$COMMIT_DELEG_FLAG" 2>/dev/null || echo "")
  REVIEW_HASH=$(jq -r '.stagedDiffHash // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  REVIEW_ID=$(jq -r '.requestId // empty' "$REVIEW_JSON" 2>/dev/null || echo "")
  if [ "$REVIEW_ID" != "$REVIEW_REQUEST_ID" ] || [ -z "$CHECKPOINT_HASH" ] || [ "$REVIEW_HASH" != "$CHECKPOINT_HASH" ]; then
    echo "レビュー後に差分が変わったため、コミット前レビューをもう一度実行してください。" >&2
    exit 2
  fi
fi

exit 0
