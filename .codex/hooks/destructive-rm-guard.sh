#!/bin/bash
# PreToolUse (Bash): block unsafe rm -rf commands.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

CMD=$(codex_tool_command "$INPUT")
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"
if [ -z "$CMD" ]; then
  exit 0
fi

if ! guard_command_has_destructive_delete "$CMD"; then
  exit 0
fi

if guard_rm_rf_all_targets_safe "$CMD"; then
  exit 0
fi

cat >&2 <<'EOF'
Unsafe destructive delete blocked by Codex hook.

Allowed targets are build/cache artifacts only:
  node_modules, .next, build, dist, __pycache__, coverage,
  .turbo, .cache, .pytest_cache, .mypy_cache, .ruff_cache,
  out, .parcel-cache, .vercel, target, tmp

git clean -fdx and find -delete are blocked.
EOF
exit 2
