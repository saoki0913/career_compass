#!/bin/bash
# Codex session bootstrap summary.
set -e
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

echo "=== career_compass Codex context ==="
echo ""
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
echo ""
echo "--- git status (first 20 lines) ---"
git status --short 2>/dev/null | head -20 || true
echo ""
echo "--- recent commits ---"
git log --oneline -5 2>/dev/null || true
echo ""
echo "--- codex agents ---"
if [ -d .codex/agents ]; then
  find .codex/agents -maxdepth 1 -type f -name '*.toml' | sort | sed 's#^.codex/agents/##' | sed 's/\.toml$//' | sed 's/^/  - /'
elif [ -d .agents/agents ]; then
  find .agents/agents -maxdepth 1 -type f -name '*.md' ! -name 'README.md' | sort | sed 's#^.agents/agents/##' | sed 's/\.md$//' | sed 's/^/  - /'
fi
exit 0
