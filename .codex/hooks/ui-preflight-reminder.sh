#!/bin/bash
# Codex wrapper for the UI preflight gate.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

PROJECT_DIR=$(codex_project_dir "$INPUT")

while IFS= read -r FILE_PATH; do
  [ -z "$FILE_PATH" ] && continue
  REL_PATH=$(codex_rel_path "$PROJECT_DIR" "$FILE_PATH")

  if printf '%s' "$REL_PATH" | grep -qE '^src/app/api/'; then
    continue
  fi

  if printf '%s' "$REL_PATH" | grep -qE '^src/(components/|app/(.*/)?(page|layout|loading)\.tsx$)'; then
    (cd "$PROJECT_DIR" && node tools/check-ui-preflight-gate.mjs "$REL_PATH")
  fi
done < <(codex_changed_files "$INPUT")

exit 0
