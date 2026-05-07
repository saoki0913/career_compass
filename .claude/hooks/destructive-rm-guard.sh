#!/bin/bash
# PreToolUse (Bash): destructive delete をホワイトリスト方式でガード。
set -euo pipefail
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
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
⛔ destructive delete の対象がホワイトリスト外です。

許可されている対象:
  node_modules, .next, build, dist, __pycache__, coverage,
  .turbo, .cache, .pytest_cache, .mypy_cache, .ruff_cache,
  out, .parcel-cache, .vercel, target, tmp

プロジェクトのソースコードやルートディレクトリの削除は禁止です。
個別ファイルの削除には rm -f (非再帰) を使用してください。git clean -fdx / find -delete は禁止です。
EOF
exit 2
