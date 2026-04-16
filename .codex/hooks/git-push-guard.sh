#!/bin/bash
# Codex wrapper for guarding dangerous git push commands.
set -e
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // .command // empty')
if [ -z "$CMD" ]; then
  exit 0
fi

if ! echo "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+push'; then
  exit 0
fi

if echo "$CMD" | grep -qE 'git[[:space:]]+push([[:space:]].*)?(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  cat >&2 <<'EOF'
⛔ git push --force 系は Codex でも禁止です。追加コミットか、明示承認つきの限定的な操作に切り替えてください。
EOF
  exit 2
fi

if echo "$CMD" | grep -qE 'git[[:space:]]+push.*[[:space:]](main|develop)([[:space:]]|$)'; then
  cat >&2 <<'EOF'
⚠ main / develop への直接 push を検知しました。release は `make deploy` 系の導線を優先してください。
EOF
fi
exit 0
