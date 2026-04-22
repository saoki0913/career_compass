#!/bin/bash
# PreToolUse (Read|Bash): codex-company/.secrets/ への直接アクセスを block。
set -e
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL" = "Read" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
  if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -q 'codex-company/\.secrets/'; then
    cat >&2 <<'EOF'
⛔ codex-company/.secrets/ の直接 Read は禁止されています（CLAUDE.md ルール）。

許可される操作:
  - zsh scripts/release/sync-career-compass-secrets.sh --check
  - 個別インベントリ確認のみ（実値は読まない）

env テンプレの確認は docs/release/ENV_REFERENCE.md を参照してください。
EOF
    exit 2
  fi
elif [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
  if [ -n "$CMD" ] && echo "$CMD" | grep -qE '(^|[^a-zA-Z_])(cat|head|tail|less|more|bat|sed|awk|grep|rg)([[:space:]].*)?codex-company/\.secrets/'; then
    cat >&2 <<'EOF'
⛔ codex-company/.secrets/ 配下を cat/head/tail/less/grep 等で読むのは禁止です。

許可される操作:
  - zsh scripts/release/sync-career-compass-secrets.sh --check
EOF
    exit 2
  fi
fi
exit 0
