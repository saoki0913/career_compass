#!/bin/bash
# Codex wrapper for closeout summary.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
STATUS=$(git -C "$PROJECT_DIR" status --short 2>/dev/null || true)

echo "Codex stop summary: branch=$BRANCH" >&2
if [ -n "$STATUS" ]; then
  echo "$STATUS" >&2
else
  echo "working tree clean" >&2
fi

if ! node tools/run-verify-status.mjs >/tmp/career-compass-codex-verify-status.$$ 2>/tmp/career-compass-codex-verify-status.err; then
  cat /tmp/career-compass-codex-verify-status.err >&2 || true
  cat /tmp/career-compass-codex-verify-status.$$ >&2 || true
else
  cat /tmp/career-compass-codex-verify-status.$$ >&2 || true
fi
rm -f /tmp/career-compass-codex-verify-status.$$ /tmp/career-compass-codex-verify-status.err
exit 0
