#!/bin/bash
# Unified Codex CLI delegation wrapper.
# Usage: delegate.sh <mode> [--context-file <path>] [--timeout <sec>] [--model <model>]
# Modes: plan_review, implementation, post_review
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/prompt-templates"
STATE_DIR="$PROJECT_DIR/.claude/state/codex-handoffs"

# ─── Argument parsing ────────────────────────────────────────────
MODE=""
CONTEXT_FILE=""
DEFAULT_TIMEOUT_SEC=3600
MAX_TIMEOUT_SEC=7200
TIMEOUT_SEC=$DEFAULT_TIMEOUT_SEC
MODEL="gpt-5.4"

while [ $# -gt 0 ]; do
  case "$1" in
    plan_review|implementation|post_review)
      MODE="$1"; shift ;;
    --context-file)
      CONTEXT_FILE="$2"; shift 2 ;;
    --timeout)
      TIMEOUT_SEC="$2"; shift 2 ;;
    --model)
      MODEL="$2"; shift 2 ;;
    *)
      echo "ERROR: unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "ERROR: invalid mode. Usage: delegate.sh <plan_review|implementation|post_review> [options]" >&2
  exit 1
fi

if ! [[ "$TIMEOUT_SEC" =~ ^[0-9]+$ ]]; then
  echo "ERROR: --timeout must be an integer number of seconds." >&2
  exit 1
fi

if [ "$TIMEOUT_SEC" -le 0 ]; then
  echo "ERROR: --timeout must be greater than 0 seconds." >&2
  exit 1
fi

if [ "$TIMEOUT_SEC" -gt "$MAX_TIMEOUT_SEC" ]; then
  echo "ERROR: --timeout exceeds max allowed ${MAX_TIMEOUT_SEC}s." >&2
  exit 1
fi

# ─── Guardrails ───────────────────────────────────────────────────
if [ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
  if grep -qiE 'codex-company/\.secrets|\.env\b|\.pem\b|\.key\b|\.p12\b' "$CONTEXT_FILE"; then
    echo "ERROR: context file references secrets or sensitive files. Aborting." >&2
    exit 1
  fi
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found. Install with: npm install -g @openai/codex" >&2
  exit 1
fi

# ─── Request ID & artifact dir ────────────────────────────────────
REQUEST_ID="${MODE}-$(date +%Y%m%d-%H%M%S)-$(head -c 2 /dev/urandom | xxd -p)"
RESULT_DIR="$STATE_DIR/$REQUEST_ID"
mkdir -p "$RESULT_DIR"

# ─── Prompt construction ─────────────────────────────────────────
TEMPLATE_FILE="$TEMPLATE_DIR/${MODE//_/-}.md"
if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "ERROR: template not found: $TEMPLATE_FILE" >&2
  exit 1
fi

TEMPLATE=$(cat "$TEMPLATE_FILE")
CONTEXT=""
if [ -n "$CONTEXT_FILE" ] && [ -f "$CONTEXT_FILE" ]; then
  CONTEXT=$(cat "$CONTEXT_FILE")
fi

HARNESS_DIRECTIVES="## Codex Harness Activation
1. Read .codex/commands/codex-start.md first and follow its orientation guidance before analyzing the task.
2. Use AGENTS.md and .codex/config.toml routing to identify the best matching specialist under .codex/agents/*.toml.
3. Read the chosen agent developer_instructions and enabled skills.config, then actively use the relevant guidance from .codex/skills/ and .agents/skills/.
4. If the task spans multiple domains or requires scope/boundary judgment, consult architect first and then continue with the concrete specialist agent.
5. In the final response, report which agent and skills you used. If none applied, explain why."

PROMPT="${TEMPLATE}

${HARNESS_DIRECTIVES}

## Additional Context
${CONTEXT:-No additional context provided.}

## Project Root
${PROJECT_DIR}"

printf '%s\n' "$PROMPT" > "$RESULT_DIR/request.md"

# ─── Execute Codex CLI ────────────────────────────────────────────
START_TS=$(date +%s)
EXIT_CODE=0
STATUS="SUCCESS"

case "$MODE" in
  plan_review)
    timeout "$TIMEOUT_SEC" codex exec \
      --sandbox read-only \
      -m "$MODEL" \
      -o "$RESULT_DIR/result.md" \
      --ephemeral \
      -C "$PROJECT_DIR" \
      "$PROMPT" 2>"$RESULT_DIR/stderr.tmp" || EXIT_CODE=$?
    ;;
  implementation)
    timeout "$TIMEOUT_SEC" codex exec \
      --sandbox workspace-write \
      -m "$MODEL" \
      -o "$RESULT_DIR/result.md" \
      --ephemeral \
      -C "$PROJECT_DIR" \
      "$PROMPT" 2>"$RESULT_DIR/stderr.tmp" || EXIT_CODE=$?
    ;;
  post_review)
    # codex exec review: --uncommitted と PROMPT は排他。
    # レビュー指針は .codex/skills/code-reviewer/SKILL.md が自動参照される。
    timeout "$TIMEOUT_SEC" codex exec review \
      --uncommitted \
      -m "$MODEL" \
      -o "$RESULT_DIR/result.md" \
      --ephemeral \
      2>"$RESULT_DIR/stderr.tmp" || EXIT_CODE=$?
    ;;
esac

END_TS=$(date +%s)
DURATION_MS=$(( (END_TS - START_TS) * 1000 ))

# ─── Failure classification ──────────────────────────────────────
if [ "$EXIT_CODE" -eq 124 ]; then
  STATUS="TIMEOUT"
elif [ "$EXIT_CODE" -ne 0 ]; then
  STATUS="CODEX_ERROR"
elif [ ! -s "$RESULT_DIR/result.md" ]; then
  STATUS="PARSE_FAILURE"
fi

# 成功時のみ stderr.tmp を削除。失敗時はデバッグ用に残す
if [ "$STATUS" = "SUCCESS" ]; then
  rm -f "$RESULT_DIR/stderr.tmp"
fi

# ─── Write meta.json ─────────────────────────────────────────────
cat > "$RESULT_DIR/meta.json" <<METAEOF
{
  "mode": "$MODE",
  "request_id": "$REQUEST_ID",
  "model": "$MODEL",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "exit_code": $EXIT_CODE,
  "duration_ms": $DURATION_MS,
  "status": "$STATUS",
  "context_file": "${CONTEXT_FILE:-null}",
  "timeout_sec": $TIMEOUT_SEC
}
METAEOF

# ─── Output summary ──────────────────────────────────────────────
echo "Codex delegation complete: mode=$MODE status=$STATUS request_id=$REQUEST_ID" >&2
echo "Result: $RESULT_DIR/result.md" >&2

if [ "$STATUS" != "SUCCESS" ]; then
  echo "WARNING: Codex delegation failed (status=$STATUS, exit_code=$EXIT_CODE). Claude should continue with fallback." >&2
  exit "$EXIT_CODE"
fi

echo "$RESULT_DIR/result.md"
