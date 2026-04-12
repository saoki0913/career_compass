#!/bin/bash
# SessionStart (startup|resume): 作業コンテキストを stdout に出す。
# 公式仕様では SessionStart hook の stdout が context に注入される。
set -e
cd "$CLAUDE_PROJECT_DIR" || exit 0

echo "=== career_compass 作業コンテキスト ==="
echo ""
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "branch: $BRANCH"
echo ""

echo "--- git status (短縮, 先頭 20 行) ---"
git status --short 2>/dev/null | head -20 || true
echo ""

echo "--- 直近 5 コミット ---"
git log --oneline -5 2>/dev/null || true
echo ""

echo "--- active subagents ---"
if [ -d .claude/agents ]; then
  ls .claude/agents 2>/dev/null | sed 's/\.md$//' | sed 's/^/  - /'
fi
exit 0
