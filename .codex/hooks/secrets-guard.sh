#!/bin/bash
# Codex wrapper for guarding direct secret reads.
set -e
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [ "$TOOL" = "Read" ]; then
  FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // empty')
  if [ -n "$FILE_PATH" ] && echo "$FILE_PATH" | grep -q 'codex-company/\.secrets/'; then
    cat >&2 <<'EOF'
⛔ `codex-company/.secrets/` の直接 Read は禁止です。`zsh scripts/release/sync-career-compass-secrets.sh --check` を使ってください。
EOF
    exit 2
  fi
elif [ "$TOOL" = "Bash" ] || [ "$TOOL" = "" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // .command // empty')
  if [ -n "$CMD" ] && echo "$CMD" | grep -qE '(^|[^a-zA-Z_])(cat|head|tail|less|more|bat|sed|awk|grep|rg)([[:space:]].*)?codex-company/\.secrets/'; then
    cat >&2 <<'EOF'
⛔ `codex-company/.secrets/` を読む Bash コマンドは禁止です。`zsh scripts/release/sync-career-compass-secrets.sh --check` を使ってください。
EOF
    exit 2
  fi
fi
exit 0
