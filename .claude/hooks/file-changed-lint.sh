#!/bin/bash
# FileChanged: high-signal JS/TS files changed on disk -> run focused eslint.
set -euo pipefail

INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

REL_PATH=$(python3 - <<'PY' "$PROJECT_DIR" "$FILE_PATH"
from pathlib import Path
import sys
project = Path(sys.argv[1]).resolve()
file_path = Path(sys.argv[2]).resolve()
try:
    print(file_path.relative_to(project))
except ValueError:
    print("")
PY
)

if [ -z "$REL_PATH" ]; then
  exit 0
fi

if (cd "$PROJECT_DIR" && npm run lint -- "$REL_PATH") >/tmp/career-compass-file-lint.out 2>/tmp/career-compass-file-lint.err; then
  echo "FileChanged lint OK: $REL_PATH" >&2
else
  echo "FileChanged lint failed: $REL_PATH" >&2
  cat /tmp/career-compass-file-lint.err >&2
fi

exit 0
