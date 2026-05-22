#!/bin/bash
# Unified Codex CLI delegation wrapper.
# Usage: delegate.sh <mode> [--context-file <path>] [--timeout <sec>] [--model <model>]
# Modes: plan_review, implementation, post_review, imagegen
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/prompt-templates"
STATE_DIR="$PROJECT_DIR/.codex/state/handoffs"

# ─── Argument parsing ────────────────────────────────────────────
MODE=""
CONTEXT_FILE=""
DEFAULT_TIMEOUT_SEC=3600
MAX_TIMEOUT_SEC=7200
TIMEOUT_SEC=$DEFAULT_TIMEOUT_SEC
MODEL="gpt-5.5"
MODEL_REASONING_EFFORT="medium"
PLAN_REVIEW_PARALLELISM=3
POST_REVIEW_PARALLELISM=3

while [ $# -gt 0 ]; do
  case "$1" in
    plan_review|implementation|post_review|imagegen)
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
  echo "ERROR: invalid mode. Usage: delegate.sh <plan_review|implementation|post_review|imagegen> [options]" >&2
  exit 1
fi

case "$MODE" in
  plan_review)
    MODEL_REASONING_EFFORT="xhigh"
    ;;
  post_review)
    MODEL_REASONING_EFFORT="high"
    ;;
esac

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
  if grep -qiE 'codex-company/\.secrets|(^|/)\.env([^/[:space:]]*)?(\b|$)|\.(pem|key|p12)\b|(^|/)secrets/|(^|/)private/|OPENAI_API_KEY|ANTHROPIC_API_KEY|STRIPE_[A-Z_]*KEY|SUPABASE_[A-Z_]*KEY' "$CONTEXT_FILE"; then
    echo "ERROR: context file references secrets or sensitive files. Aborting." >&2
    exit 1
  fi
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not found. Install with: npm install -g @openai/codex" >&2
  exit 1
fi

if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
else
  echo "ERROR: neither timeout nor gtimeout is available. Install coreutils on macOS or adjust the wrapper." >&2
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
5. Keep agent and skill choices as internal working context unless the user asks for those details."

# imagegen skips harness directives to reduce overhead and avoid connection timeouts
if [ "$MODE" = "imagegen" ]; then
  IMAGEGEN_ENFORCE='## REMINDER: $imagegen Parameters (ENFORCED BY HARNESS)
You MUST call the $imagegen built-in tool with these exact parameters on every invocation:
  model = "gpt-image-2"
  quality = "high"
Do NOT use any other image generation method (no Python scripts, no CLI tools, no curl).
Do NOT omit these parameters or use defaults.'

  PROMPT="${TEMPLATE}

${IMAGEGEN_ENFORCE}

## Additional Context
${CONTEXT:-No additional context provided.}

## Project Root
${PROJECT_DIR}"
else
  PROMPT="${TEMPLATE}

${HARNESS_DIRECTIVES}

## Additional Context
${CONTEXT:-No additional context provided.}

## Project Root
${PROJECT_DIR}"
fi

printf '%s\n' "$PROMPT" > "$RESULT_DIR/request.md"

# ─── Execute Codex CLI ────────────────────────────────────────────
START_TS=$(date +%s)
EXIT_CODE=0
STATUS="SUCCESS"

# imagegen: timestamp marker for image collection
if [ "$MODE" = "imagegen" ]; then
  touch "$RESULT_DIR/.start_marker"
  sleep 1
fi

CODEX_EXEC_COMMON_ARGS=(
  -m "$MODEL"
  -c model_reasoning_effort="$MODEL_REASONING_EFFORT"
  -c experimental_use_rmcp_client=false
  # Keep delegated workers isolated from user-scope MCP servers. Parent
  # sessions should fetch docs and pass them through --context-file.
  --ignore-user-config
  --ephemeral
)

extract_review_status() {
  awk '
    /^##[[:space:]]*(Status|状態|結果)[[:space:]]*$/ { in_status = 1; next }
    in_status && /^(APPROVE|REQUEST_CHANGES|NEEDS_DISCUSSION)$/ { print; exit }
    in_status && /^##[[:space:]]/ { in_status = 0 }
  ' "$1"
}

extract_plan_review_status() {
  awk '
    /^##[[:space:]]*(Status|状態|結果)[[:space:]]*$/ { in_status = 1; next }
    in_status && /^(PASS|PASS_WITH_CONCERNS|NEEDS_REVISION)$/ { print; exit }
    in_status && /^##[[:space:]]/ { in_status = 0 }
  ' "$1"
}

aggregate_plan_review_results() {
  local aggregate_status=""
  local result_count=0
  local worker_result=""
  local worker_status=""
  local worker_index=1

  for worker_result in "$RESULT_DIR"/result-*.md; do
    [ -f "$worker_result" ] || continue
    result_count=$((result_count + 1))
    worker_status="$(extract_plan_review_status "$worker_result")"
    if [ "$worker_status" = "NEEDS_REVISION" ]; then
      aggregate_status="NEEDS_REVISION"
    elif { [ "$worker_status" = "PASS_WITH_CONCERNS" ] || [ -z "$worker_status" ]; } && [ "$aggregate_status" != "NEEDS_REVISION" ]; then
      aggregate_status="PASS_WITH_CONCERNS"
    elif [ "$worker_status" = "PASS" ] && [ -z "$aggregate_status" ]; then
      aggregate_status="PASS"
    fi
  done
  if [ -z "$aggregate_status" ]; then
    aggregate_status="NEEDS_REVISION"
  fi

  {
    echo "## 状態"
    echo "$aggregate_status"
    echo
    echo "## 概要"
    echo "3 並列の code-reviewer で Plan 確定前レビューを実行し、厳しい方の判定を統合結果として採用しました。"
    echo
    echo "## 指摘"
    for worker_result in "$RESULT_DIR"/result-*.md; do
      [ -f "$worker_result" ] || continue
      echo
      echo "### code-reviewer #${worker_index}"
      grep -E '^- severity: (critical|high|medium|low) \|' "$worker_result" || true
      worker_index=$((worker_index + 1))
    done
    echo
    echo "## 各レビュー原文"
    worker_index=1
    for worker_result in "$RESULT_DIR"/result-*.md; do
      [ -f "$worker_result" ] || continue
      echo
      echo "### code-reviewer #${worker_index}"
      cat "$worker_result"
      worker_index=$((worker_index + 1))
    done
  } > "$RESULT_DIR/result.md"
}

aggregate_post_review_results() {
  local aggregate_status="NEEDS_DISCUSSION"
  local result_count=0
  local worker_result=""
  local worker_status=""
  local worker_index=1

  for worker_result in "$RESULT_DIR"/result-*.md; do
    [ -f "$worker_result" ] || continue
    result_count=$((result_count + 1))
    worker_status="$(extract_review_status "$worker_result")"
    if [ "$result_count" -eq 1 ] && [ "$worker_status" = "APPROVE" ]; then
      aggregate_status="APPROVE"
    elif [ "$worker_status" = "REQUEST_CHANGES" ]; then
      aggregate_status="REQUEST_CHANGES"
    elif { [ "$worker_status" = "NEEDS_DISCUSSION" ] || [ -z "$worker_status" ]; } && [ "$aggregate_status" != "REQUEST_CHANGES" ]; then
      aggregate_status="NEEDS_DISCUSSION"
    fi
  done

  {
    echo "## 状態"
    echo "$aggregate_status"
    echo
    echo "## 概要"
    echo "3 並列の code-reviewer を実行し、厳しい方の判定を統合結果として採用しました。"
    echo
    echo "## 指摘"
    for worker_result in "$RESULT_DIR"/result-*.md; do
      [ -f "$worker_result" ] || continue
      echo
      echo "### code-reviewer #${worker_index}"
      grep -E '^- severity: (critical|high|medium|low) \|' "$worker_result" || true
      worker_index=$((worker_index + 1))
    done
    echo
    echo "## 各レビュー原文"
    worker_index=1
    for worker_result in "$RESULT_DIR"/result-*.md; do
      [ -f "$worker_result" ] || continue
      echo
      echo "### code-reviewer #${worker_index}"
      cat "$worker_result"
      worker_index=$((worker_index + 1))
    done
  } > "$RESULT_DIR/result.md"
}

case "$MODE" in
  plan_review)
    PIDS=()
    for worker_index in $(seq 1 "$PLAN_REVIEW_PARALLELISM"); do
      "$TIMEOUT_BIN" "$TIMEOUT_SEC" codex exec \
        --sandbox read-only \
        "${CODEX_EXEC_COMMON_ARGS[@]}" \
        -o "$RESULT_DIR/result-${worker_index}.md" \
        -C "$PROJECT_DIR" \
        "$PROMPT" 2>"$RESULT_DIR/stderr-${worker_index}.tmp" &
      PIDS+=("$!")
    done

    for worker_index in "${!PIDS[@]}"; do
      worker_exit_code=0
      wait "${PIDS[$worker_index]}" || worker_exit_code=$?
      if [ "$worker_exit_code" -eq 124 ]; then
        EXIT_CODE=124
      elif [ "$worker_exit_code" -ne 0 ] && [ "$EXIT_CODE" -eq 0 ]; then
        EXIT_CODE="$worker_exit_code"
      fi
    done

    aggregate_plan_review_results
    cat "$RESULT_DIR"/stderr-*.tmp > "$RESULT_DIR/stderr.tmp" 2>/dev/null || true
    ;;
  implementation)
    "$TIMEOUT_BIN" "$TIMEOUT_SEC" codex exec \
      --sandbox workspace-write \
      "${CODEX_EXEC_COMMON_ARGS[@]}" \
      -o "$RESULT_DIR/result.md" \
      -C "$PROJECT_DIR" \
      "$PROMPT" 2>"$RESULT_DIR/stderr.tmp" || EXIT_CODE=$?
    ;;
  post_review)
    # codex exec review: --uncommitted と PROMPT は排他。
    # レビュー指針は .codex/skills/code-reviewer/SKILL.md が自動参照される。
    # NOTE: codex exec review は -C を受け付けないため subshell で cd する。
    # RESULT_DIR は絶対パスなので -o / stderr redirect は影響なし。
    PIDS=()
    for worker_index in $(seq 1 "$POST_REVIEW_PARALLELISM"); do
      (
        cd "$PROJECT_DIR" && \
        "$TIMEOUT_BIN" "$TIMEOUT_SEC" codex exec review \
          --uncommitted \
          "${CODEX_EXEC_COMMON_ARGS[@]}" \
          -o "$RESULT_DIR/result-${worker_index}.md" \
          2>"$RESULT_DIR/stderr-${worker_index}.tmp"
      ) &
      PIDS+=("$!")
    done

    for worker_index in "${!PIDS[@]}"; do
      worker_exit_code=0
      wait "${PIDS[$worker_index]}" || worker_exit_code=$?
      if [ "$worker_exit_code" -eq 124 ]; then
        EXIT_CODE=124
      elif [ "$worker_exit_code" -ne 0 ] && [ "$EXIT_CODE" -eq 0 ]; then
        EXIT_CODE="$worker_exit_code"
      fi
    done

    aggregate_post_review_results
    cat "$RESULT_DIR"/stderr-*.tmp > "$RESULT_DIR/stderr.tmp" 2>/dev/null || true
    ;;
  imagegen)
    # Use a lightweight workspace to avoid project harness overhead (agents,
    # skills, hooks) which causes $imagegen connection timeouts. Images are
    # generated to Codex cache (~/.codex/generated_images/) then collected.
    IMAGEGEN_WORKSPACE="/tmp/imagegen-workspace-$$"
    mkdir -p "$IMAGEGEN_WORKSPACE/public/generated_images" "$PROJECT_DIR/public/generated_images"
    if [ ! -d "$IMAGEGEN_WORKSPACE/.git" ]; then
      git init "$IMAGEGEN_WORKSPACE" >/dev/null 2>&1
      git -C "$IMAGEGEN_WORKSPACE" -c core.hooksPath=/dev/null commit --allow-empty -m "init" >/dev/null 2>&1
    fi
    "$TIMEOUT_BIN" "$TIMEOUT_SEC" codex exec \
      --sandbox workspace-write \
      "${CODEX_EXEC_COMMON_ARGS[@]}" \
      -o "$RESULT_DIR/result.md" \
      -C "$IMAGEGEN_WORKSPACE" \
      "$PROMPT" < /dev/null 2>"$RESULT_DIR/stderr.tmp" || EXIT_CODE=$?
    # Copy any images Codex placed in the lightweight workspace
    find "$IMAGEGEN_WORKSPACE/public/generated_images" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.webp' \) \
      -exec cp {} "$PROJECT_DIR/public/generated_images/" \; 2>/dev/null
    rm -rf "$IMAGEGEN_WORKSPACE"
    ;;
esac

END_TS=$(date +%s)
DURATION_MS=$(( (END_TS - START_TS) * 1000 ))

# ─── imagegen: image collection ──────────────────────────────────
# Scope audit removed for imagegen: Codex sandbox (workspace-write) already
# enforces write restrictions. Git-status-based audit caused false positives
# when parallel sessions modified unrelated files during the run.
IMAGE_COUNT=0
if [ "$MODE" = "imagegen" ] && [ -f "$RESULT_DIR/.start_marker" ]; then
  rm -f "$RESULT_DIR/.git_before" "$RESULT_DIR/.git_after"

  # Collect generated images from project dir AND Codex cache
  CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
  IMAGE_FILES=()
  while IFS= read -r img_path; do
    # Copy Codex-cache images into project generated_images/
    if [[ "$img_path" == "$CODEX_HOME"* ]]; then
      basename_img=$(basename "$img_path")
      cp "$img_path" "$PROJECT_DIR/public/generated_images/$basename_img" 2>/dev/null
      img_path="$PROJECT_DIR/public/generated_images/$basename_img"
    fi
    IMAGE_FILES+=("$img_path")
    IMAGE_COUNT=$((IMAGE_COUNT + 1))
  done < <(
    find "$PROJECT_DIR/public/generated_images" -type f \
      \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' -o -name '*.svg' \) \
      -newer "$RESULT_DIR/.start_marker" 2>/dev/null
    find "$CODEX_HOME/generated_images" -type f \
      \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \) \
      -newer "$RESULT_DIR/.start_marker" 2>/dev/null
  )

  printf '[\n' > "$RESULT_DIR/images.json"
  for i in "${!IMAGE_FILES[@]}"; do
    rel="${IMAGE_FILES[$i]#$PROJECT_DIR/}"
    printf '  "%s"' "$rel" >> "$RESULT_DIR/images.json"
    [ "$i" -lt $((IMAGE_COUNT - 1)) ] && printf ',\n' >> "$RESULT_DIR/images.json"
  done
  printf '\n]\n' >> "$RESULT_DIR/images.json"
fi

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
  rm -f "$RESULT_DIR/stderr.tmp" "$RESULT_DIR"/stderr-*.tmp
fi

# ─── Write meta.json ─────────────────────────────────────────────
jq -n \
  --arg mode "$MODE" \
  --arg request_id "$REQUEST_ID" \
  --arg model "$MODEL" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg status "$STATUS" \
  --arg context_file "$CONTEXT_FILE" \
  --argjson exit_code "$EXIT_CODE" \
  --argjson duration_ms "$DURATION_MS" \
  --argjson timeout_sec "$TIMEOUT_SEC" \
  --argjson image_count "$IMAGE_COUNT" \
  '{
    mode: $mode,
    request_id: $request_id,
    model: $model,
    timestamp: $timestamp,
    exit_code: $exit_code,
    duration_ms: $duration_ms,
    status: $status,
    context_file: (if $context_file == "" then null else $context_file end),
    timeout_sec: $timeout_sec,
    image_count: $image_count
  }' > "$RESULT_DIR/meta.json"

DISPLAY_PATH="$(node "$PROJECT_DIR/scripts/codex/agent-dialogue.mjs" write --result-dir "$RESULT_DIR" --project "$PROJECT_DIR")"

# ─── Output summary ──────────────────────────────────────────────
echo "$(jq -r '.title' "$DISPLAY_PATH")" >&2
echo "$(jq -r '.summary' "$DISPLAY_PATH")" >&2
echo "次の対応: $(jq -r '.nextAction' "$DISPLAY_PATH")" >&2
if [ "$MODE" = "imagegen" ] && [ "$IMAGE_COUNT" -gt 0 ]; then
  echo "生成した画像: ${IMAGE_COUNT} 件" >&2
fi

if [ "$STATUS" != "SUCCESS" ]; then
  echo "Codexの実行を完了できませんでした。必要な部分だけ手元で引き継いでください。" >&2
  exit "$EXIT_CODE"
fi

echo "$RESULT_DIR/result.md"
