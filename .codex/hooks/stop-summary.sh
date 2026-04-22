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
exit 0
