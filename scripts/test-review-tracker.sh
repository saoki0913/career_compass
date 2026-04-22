#!/bin/bash
# Verify integrity of docs/review/TRACKER.md against docs/plan/ and EXECUTION_ORDER.md
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TRACKER="docs/review/TRACKER.md"
EXEC_ORDER="docs/plan/EXECUTION_ORDER.md"
ERRFILE=$(mktemp)
echo 0 > "$ERRFILE"

bump_err() { echo $(( $(cat "$ERRFILE") + 1 )) > "$ERRFILE"; }

if [ ! -f "$TRACKER" ]; then
  echo "ERROR: $TRACKER not found"
  rm -f "$ERRFILE"
  exit 1
fi

# 1. Check that all plan links in TRACKER point to existing files
echo "--- Checking TRACKER plan links ---"
for link in $(grep -oE '\.\./plan/[A-Z_]+\.md' "$TRACKER" | sort -u); do
  resolved="docs/plan/$(basename "$link")"
  if [ ! -f "$resolved" ]; then
    echo "ERROR: TRACKER references $link but $resolved does not exist"
    bump_err
  fi
done

# 2. Check that all review links in TRACKER point to existing files
echo "--- Checking TRACKER review links ---"
for link in $(grep -oE '\([a-z][-a-z]*/[^)]+\.md\)' "$TRACKER" | tr -d '()' | sort -u); do
  resolved="docs/review/$link"
  if [ ! -f "$resolved" ]; then
    echo "ERROR: TRACKER references review $link but $resolved does not exist"
    bump_err
  fi
done

# 3. Check that every *_PLAN.md in docs/plan/ (except EXECUTION_ORDER) is listed in TRACKER
echo "--- Checking plan coverage ---"
for plan in docs/plan/*_PLAN.md; do
  basename_plan=$(basename "$plan")
  if ! grep -q "$basename_plan" "$TRACKER"; then
    echo "WARNING: $basename_plan exists in docs/plan/ but is not listed in TRACKER"
  fi
done

# 4. Check that EXECUTION_ORDER references plans that exist in TRACKER
echo "--- Checking EXECUTION_ORDER consistency ---"
if [ -f "$EXEC_ORDER" ]; then
  for plan_name in $(grep -oE '[A-Z][A-Z_]+_PLAN' "$EXEC_ORDER" | sort -u); do
    if ! grep -q "$plan_name" "$TRACKER"; then
      echo "WARNING: EXECUTION_ORDER references $plan_name but it's not in TRACKER"
    fi
  done
fi

# 5. Check for stale v1/v2 references
echo "--- Checking for stale v1/v2 references ---"
STALE=$(grep -rl "feature/v[12]/" docs/ 2>/dev/null || true)
if [ -n "$STALE" ]; then
  echo "ERROR: Found stale v1/v2 references in:"
  echo "$STALE"
  bump_err
fi

# 6. Check frontmatter presence in review/plan files
echo "--- Checking frontmatter ---"
for f in docs/review/feature/*.md docs/review/security/*.md \
         docs/review/maintainability-architecture/[0-9]*.md \
         docs/review/harness/[0-9]*.md; do
  if [ -f "$f" ] && ! head -1 "$f" | grep -q '^---$'; then
    echo "WARNING: $f lacks YAML frontmatter"
  fi
done
for f in docs/plan/*_PLAN.md; do
  if [ -f "$f" ] && ! head -1 "$f" | grep -q '^---$'; then
    echo "WARNING: $f lacks YAML frontmatter"
  fi
done

ERRORS=$(cat "$ERRFILE")
rm -f "$ERRFILE"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS error(s) found"
  exit 1
else
  echo "PASS: TRACKER integrity check passed"
fi
