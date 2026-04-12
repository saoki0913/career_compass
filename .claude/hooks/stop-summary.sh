#!/bin/bash
# Stop: print a short git status summary when Claude finishes responding.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
STATUS=$(git -C "$PROJECT_DIR" status --short 2>/dev/null || true)

echo "Stop summary: branch=$BRANCH" >&2
if [ -n "$STATUS" ]; then
  echo "$STATUS" >&2
else
  echo "working tree clean" >&2
fi

exit 0
