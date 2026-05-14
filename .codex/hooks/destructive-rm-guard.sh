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
この削除操作は実行できません。

削除できるのは、ビルド結果やキャッシュなど再生成できるものだけです。
許可される対象:
  node_modules, .next, build, dist, __pycache__, coverage,
  .turbo, .cache, .pytest_cache, .mypy_cache, .ruff_cache,
  out, .parcel-cache, .vercel, target, tmp

作業ツリー全体を消す操作や、広い範囲の自動削除は実行できません。
EOF
exit 2
