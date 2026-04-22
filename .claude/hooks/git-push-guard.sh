#!/bin/bash
# PreToolUse (Bash): git push の --force 系は block、main/develop は警告のみ。
set -e
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -z "$CMD" ]; then
  exit 0
fi

# git push が含まれていない Bash コマンドは素通り
if ! echo "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+push'; then
  exit 0
fi

# --force / -f / --force-with-lease は block
if echo "$CMD" | grep -qE 'git[[:space:]]+push([[:space:]].*)?(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
  cat >&2 <<'EOF'
⛔ git push --force 系は明示承認なしでは実行できません。

代替案:
  - 追加コミットで修正
  - git push --force-with-lease=<refname>:<expected> をユーザー承認のもとで
  - rebase による履歴整理が本当に必要か、PR レビュー後に検討

release の正本は make deploy / scripts/release/release-career-compass.sh です。
EOF
  exit 2
fi

# main / develop への push は警告のみ
if echo "$CMD" | grep -qE 'git[[:space:]]+push.*[[:space:]](main|develop)([[:space:]]|$)'; then
  cat >&2 <<'EOF'
⚠ main / develop への直接 push を検知しました。

career_compass の本番リリース正本:
  - make deploy                 # staged-only
  - make ops-release-check      # 全ローカル変更を含める標準入口
  - make deploy-stage-all       # 上記のあと
  - scripts/release/release-career-compass.sh

release-engineer agent への委譲を推奨します。
EOF
  exit 0
fi

exit 0
