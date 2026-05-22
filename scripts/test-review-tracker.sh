#!/bin/bash
# Verify current documentation entrypoints after legacy plan/review docs cleanup.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

node scripts/docs/check-docs.mjs

ERRFILE=$(mktemp)
echo 0 > "$ERRFILE"

bump_err() { echo $(( $(cat "$ERRFILE") + 1 )) > "$ERRFILE"; }

check_markdown_links() {
  local source_file="$1"
  local source_dir
  source_dir=$(dirname "$source_file")

  while read -r raw_link; do
    local link="${raw_link%%#*}"
    if [ -z "$link" ]; then
      continue
    fi
    case "$link" in
      http://*|https://*|mailto:*)
        continue
        ;;
    esac

    local resolved
    if [[ "$link" == /* ]]; then
      resolved=".${link}"
    else
      resolved="$source_dir/$link"
    fi
    if [ ! -e "$resolved" ]; then
      echo "ERROR: $source_file references missing local path $raw_link"
      bump_err
    fi
  done < <(grep -oE '\[[^]]+\]\([^)]+\)' "$source_file" | sed -E 's/^.*\]\(([^)]+)\)$/\1/')
}

echo "--- Checking docs entrypoint links ---"
for entrypoint in README.md docs/README.md docs/INDEX.md docs/operations/platform/SECURITY.md docs/release/setup/ENV_REFERENCE.md; do
  if [ ! -f "$entrypoint" ]; then
    echo "ERROR: $entrypoint not found"
    bump_err
    continue
  fi
  check_markdown_links "$entrypoint"
done

echo "--- Checking removed legacy docs are not referenced ---"
LEGACY_REFS=$(rg -l 'docs/(PROGRESS|OVERVIEW|security/principal_spec|review/TRACKER|plan/EXECUTION_ORDER)|docs/review/TRACKER|docs/plan/EXECUTION_ORDER|principal_spec' \
  README.md docs src backend scripts tools private .agents .codex \
  --hidden \
  -g '!scripts/test-review-tracker.sh' \
  -g '!backend/tests/output/**' \
  -g '!.codex/state/**' 2>/dev/null || true)
if [ -n "$LEGACY_REFS" ]; then
  echo "ERROR: Found references to removed legacy docs in:"
  echo "$LEGACY_REFS"
  bump_err
fi

# Check for stale v1/v2 references
echo "--- Checking for stale v1/v2 references ---"
STALE=$(grep -rl "feature/v[12]/" docs/ 2>/dev/null || true)
if [ -n "$STALE" ]; then
  echo "ERROR: Found stale v1/v2 references in:"
  echo "$STALE"
  bump_err
fi

ERRORS=$(cat "$ERRFILE")
rm -f "$ERRFILE"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS error(s) found"
  exit 1
else
  echo "PASS: documentation entrypoint integrity check passed"
fi
