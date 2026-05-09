#!/bin/bash
# PreToolUse(Bash): quality gate commit check.
# Runs tools/quality-gate-check.mjs against staged files and blocks
# based on rollout phase and finding severity.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

_qg_commit_read_phase() {
  local config="$PROJECT_DIR/.claude/quality-gate.json"
  if [ ! -f "$config" ]; then
    printf 'A\n'
    return 0
  fi
  local val=""
  if command -v jq >/dev/null 2>&1; then
    val=$(jq -r '.rollout_phase // empty' "$config" 2>/dev/null || true)
  fi
  if [ -z "$val" ]; then
    val=$(grep -o '"rollout_phase"[[:space:]]*:[[:space:]]*"[^"]*"' "$config" 2>/dev/null \
      | head -1 | sed 's/.*"\([^"]*\)"/\1/' || true)
  fi
  printf '%s\n' "${val:-A}"
}

ROLLOUT_PHASE=$(_qg_commit_read_phase)

if [ "$ROLLOUT_PHASE" = "A" ]; then
  exit 0
fi

CHECK_SCRIPT="$PROJECT_DIR/tools/quality-gate-check.mjs"
if [ ! -f "$CHECK_SCRIPT" ]; then
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  exit 0
fi

RESULT=$(node "$CHECK_SCRIPT" --staged-only --mode=standard --rollout-phase="$ROLLOUT_PHASE" 2>/dev/null || true)

if [ -z "$RESULT" ]; then
  exit 0
fi

VERDICT=$(printf '%s' "$RESULT" | jq -r '.gate_verdict // empty' 2>/dev/null || true)

case "$VERDICT" in
  BLOCK)
    CRITICAL=$(printf '%s' "$RESULT" | jq -r '.critical_findings // 0' 2>/dev/null || echo "0")
    HIGH=$(printf '%s' "$RESULT" | jq -r '.high_findings // 0' 2>/dev/null || echo "0")
    CATEGORIES=$(printf '%s' "$RESULT" | jq -r '.categories_checked // [] | join(", ")' 2>/dev/null || echo "")
    FINDINGS_SUMMARY=$(printf '%s' "$RESULT" | jq -r '
      .findings // [] | map(select(.severity == "critical" or .severity == "high"))
      | .[:5] | map("  - [\(.severity)] \(.category): \(.message // .item_id) (\(.file // ""))")
      | join("\n")' 2>/dev/null || echo "")

    cat >&2 <<EOF
⛔ Quality Gate: commit をブロックしました (phase=$ROLLOUT_PHASE)

  critical=$CRITICAL, high=$HIGH
  categories: $CATEGORIES

$FINDINGS_SUMMARY

対応:
  1. 指摘箇所を修正する
  2. 正当な理由がある場合は deferral checkpoint を作成する
EOF
    exit 2
    ;;
  WARN)
    TOTAL=$(printf '%s' "$RESULT" | jq -r '.total_findings // 0' 2>/dev/null || echo "0")
    CATEGORIES=$(printf '%s' "$RESULT" | jq -r '.categories_checked // [] | join(", ")' 2>/dev/null || echo "")

    cat >&2 <<EOF
⚠️ Quality Gate: $TOTAL 件の指摘があります (phase=$ROLLOUT_PHASE, categories: $CATEGORIES)
   commit は許可しますが、対応を推奨します。
EOF
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
