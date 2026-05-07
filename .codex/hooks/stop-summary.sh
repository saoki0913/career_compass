#!/bin/bash
# Codex wrapper for closeout summary. Keep this terse because Stop hooks run at every turn end.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
STATUS=$(git -C "$PROJECT_DIR" status --short 2>/dev/null || true)

STATUS_COUNT=$(printf '%s\n' "$STATUS" | grep -cE '.' || true)
UNTRACKED_COUNT=$(printf '%s\n' "$STATUS" | grep -cE '^\?\?' || true)
TRACKED_COUNT=$((STATUS_COUNT - UNTRACKED_COUNT))

echo "Codex stop summary: branch=$BRANCH" >&2
if [ "$STATUS_COUNT" -eq 0 ]; then
  echo "working tree clean" >&2
else
  echo "working tree: ${STATUS_COUNT} changed paths (${TRACKED_COUNT} tracked, ${UNTRACKED_COUNT} untracked)" >&2
  printf '%s\n' "$STATUS" | head -20 >&2
  if [ "$STATUS_COUNT" -gt 20 ]; then
    echo "... $((STATUS_COUNT - 20)) more paths omitted" >&2
  fi
fi

VERIFY_OUT="/tmp/career-compass-codex-verify-status.$$"
VERIFY_ERR="/tmp/career-compass-codex-verify-status.err"
if node "$PROJECT_DIR/tools/run-verify-status.mjs" >"$VERIFY_OUT" 2>"$VERIFY_ERR"; then
  head -20 "$VERIFY_OUT" >&2 || true
else
  cat "$VERIFY_ERR" >&2 || true
  head -20 "$VERIFY_OUT" >&2 || true
fi
VERIFY_LINES=$(wc -l <"$VERIFY_OUT" 2>/dev/null || echo 0)
if [ "$VERIFY_LINES" -gt 20 ]; then
  echo "... $((VERIFY_LINES - 20)) more verification lines omitted" >&2
fi
rm -f "$VERIFY_OUT" "$VERIFY_ERR"
exit 0
