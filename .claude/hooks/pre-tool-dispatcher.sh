#!/bin/bash
# PreToolUse dispatcher: run expensive/specific guards only when the tool input can trigger them.
set -euo pipefail

INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // .command // empty' 2>/dev/null || true)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null || true)

run_hook() {
  local hook_name="$1"
  printf '%s' "$INPUT" | "$PROJECT_DIR/.claude/hooks/$hook_name"
}

case "$TOOL" in
  Bash|"")
    if [ -z "$CMD" ]; then
      exit 0
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])(cat|head|tail|less|more|bat|sed|awk|grep|rg)([[:space:]].*)?codex-company/\.secrets/'; then
      run_hook "secrets-guard.sh"
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+push'; then
      run_hook "git-push-guard.sh"
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[;&|]|`|\$\()\s*rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-r\s+-f|-f\s+-r)'; then
      run_hook "destructive-rm-guard.sh"
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit'; then
      run_hook "commit-codex-gate.sh"
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[;&|])\s*make\s+(test-e2e-functional-local|ai-live-local)\b|(^|[;&|])\s*(bash\s+)?scripts/dev/run-ai-live-local\.sh\b|(^|[;&|])\s*make\s+test-quality-|(^|[;&|])\s*bash\s+scripts/ci/run-ai-live\.sh\b|(^|[;&|])\s*npx\s+tsc\s+--noEmit\b|(^|[;&|])\s*npm\s+run\s+lint\b|(^|[;&|])\s*make\s+security-scan\b|(^|[;&|])\s*(bash\s+)?security/scan/run-lightweight-scan\.sh\b'; then
      run_hook "test-category-gate.sh"
    fi
    ;;

  Read|mcp__filesystem__*)
    if [ -n "$FILE_PATH" ] && printf '%s' "$FILE_PATH" | grep -q 'codex-company/\.secrets/'; then
      run_hook "secrets-guard.sh"
    fi
    ;;

  Edit|Write)
    run_hook "impl-start-codex-gate.sh"
    run_hook "prompt-edit-confirm-guard.sh"
    run_hook "bandaid-guard.sh"
    run_hook "ui-preflight-reminder.sh"
    run_hook "tdd-enforcement-guard.sh"
    ;;

  ExitPlanMode)
    run_hook "exit-plan-codex-gate.sh"
    ;;
esac

exit 0
