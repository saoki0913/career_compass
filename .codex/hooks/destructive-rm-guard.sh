#!/bin/bash
# PreToolUse (Bash): block unsafe rm -rf commands.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

CMD=$(codex_tool_command "$INPUT")
if [ -z "$CMD" ]; then
  exit 0
fi

if ! printf '%s' "$CMD" | grep -qE '(^|[;&|]|`|\$\()\s*rm\s'; then
  exit 0
fi

if ! printf '%s' "$CMD" | grep -qE '(^|[;&|]|`|\$\()\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)'; then
  exit 0
fi

SAFE_TARGETS='(node_modules|\.next|build|dist|__pycache__|coverage|\.turbo|\.cache|\.pytest_cache|\.mypy_cache|\.ruff_cache|out|\.parcel-cache|\.vercel|target|tmp|\.output|\.nuxt|\.svelte-kit)'
TARGETS=$(printf '%s' "$CMD" | grep -oE '(^|[;&|]|`|\$\()\s*rm\s+[^;&|]*' | sed -E 's/.*rm[[:space:]]+//' | tr ' ' '\n' | grep -v '^-' | grep -v '^$' || true)

if [ -z "$TARGETS" ]; then
  echo "rm -rf target is unclear. Provide an explicit safe path." >&2
  exit 2
fi

ALL_SAFE=true
while IFS= read -r target; do
  case "$target" in
    /*) ALL_SAFE=false; break ;;
  esac
  BASENAME=$(basename "${target%/}")
  if ! printf '%s' "$BASENAME" | grep -qE "^${SAFE_TARGETS}$"; then
    ALL_SAFE=false
    break
  fi
done <<< "$TARGETS"

if [ "$ALL_SAFE" = true ]; then
  exit 0
fi

cat >&2 <<'EOF'
Unsafe rm -rf blocked by Codex hook.

Allowed targets are build/cache artifacts only:
  node_modules, .next, build, dist, __pycache__, coverage,
  .turbo, .cache, .pytest_cache, .mypy_cache, .ruff_cache,
  out, .parcel-cache, .vercel, target, tmp
EOF
exit 2
