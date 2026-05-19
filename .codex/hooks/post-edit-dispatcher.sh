#!/bin/bash
# Codex wrapper for path-aware post-edit reminders.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

INPUT=$(cat)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/hook-shared.sh
. "$PROJECT_DIR/scripts/harness/hook-shared.sh"
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")

FILES=$(codex_changed_files "$INPUT")
if [ -z "$FILES" ]; then
  exit 0
fi

while IFS= read -r FILE_PATH; do
  [ -z "$FILE_PATH" ] && continue
  ABS_PATH=$(codex_abs_path "$PROJECT_DIR" "$FILE_PATH")
  REL_PATH=$(codex_rel_path "$PROJECT_DIR" "$FILE_PATH")

  maybe_emit_e2e_functional_reminder "$REL_PATH" "$SESSION_ID" "codex"

  node "$PROJECT_DIR/tools/mark-verification-stale.mjs" --file="$REL_PATH" --session="$SESSION_ID" --agent=codex >/dev/null 2>&1 || true

  if is_hotspot_path "$REL_PATH"; then
    cat >&2 <<EOF
Codex hotspot reminder: $REL_PATH was edited. Run maintainability/code review before commit.
EOF
  fi

  case "$ABS_PATH" in
    *.ts|*.tsx|*.py)
      if is_oversized_file "$ABS_PATH" 500; then
        LINES=$(file_line_count "$ABS_PATH")
        cat >&2 <<EOF
Codex maintainability reminder: edited oversized file $REL_PATH ($LINES lines). Consider refactoring before adding more responsibility.
EOF
      fi
      ;;
  esac

  CROSS_DIR=$(codex_session_state_dir)
  NEXT_API_FLAG="$CROSS_DIR/edited-next-api-${SESSION_ID}"
  FASTAPI_FLAG="$CROSS_DIR/edited-fastapi-${SESSION_ID}"
  CROSS_NOTIFIED_FLAG="$CROSS_DIR/cross-notified-${SESSION_ID}"

  case "$REL_PATH" in
    src/app/api/*) : > "$NEXT_API_FLAG" ;;
    backend/app/*) : > "$FASTAPI_FLAG" ;;
  esac

  if [ -f "$NEXT_API_FLAG" ] && [ -f "$FASTAPI_FLAG" ] && [ ! -f "$CROSS_NOTIFIED_FLAG" ]; then
    : > "$CROSS_NOTIFIED_FLAG"
    cat >&2 <<'EOF'
Codex architecture reminder: this session edited both src/app/api/ and backend/app/. Check boundary ownership and duplicate logic.
EOF
  fi

  case "$REL_PATH" in
  backend/app/prompts/*|backend/app/utils/llm*.py)
    PROMPT_STATE_DIR=$(codex_session_state_dir)
    HEAD_SHA=$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo "")
    PROMPT_DIFF_HASH=$(git -C "$PROJECT_DIR" diff -- backend/app/prompts backend/app/utils/llm.py backend/app/utils/llm_responses.py backend/app/utils/llm_streaming.py 2>/dev/null | shasum -a 256 | awk '{print $1}')
    case "$REL_PATH" in
      backend/app/prompts/es_templates/*|backend/app/prompts/reference_es.py|backend/app/prompts/es_reference_guidance.py) AFFECTED_FEATURE="es_review" ;;
      backend/app/prompts/motivation*) AFFECTED_FEATURE="motivation" ;;
      backend/app/prompts/gakuchika*) AFFECTED_FEATURE="gakuchika" ;;
      backend/app/utils/llm*.py) AFFECTED_FEATURE="llm_shared" ;;
      *) AFFECTED_FEATURE="prompt_shared" ;;
    esac
    jq -n \
      --arg changedFile "$REL_PATH" \
      --arg headSha "$HEAD_SHA" \
      --arg promptDiffHash "$PROMPT_DIFF_HASH" \
      --arg affectedFeature "$AFFECTED_FEATURE" \
      --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '{
        schemaVersion: 1,
        kind: "prompt-review-pending",
        decision: "verification-required",
        issuer: "codex-post-edit-dispatcher",
        createdAt: $createdAt,
        headSha: $headSha,
        promptDiffHash: $promptDiffHash,
        changedFiles: [$changedFile],
        affectedFeature: $affectedFeature,
        requiredVerification: {
          deterministic: [
            "cd backend && pytest tests/es_review/test_es_review_prompt_structure.py -q",
            "cd backend && pytest tests/es_review/test_reference_es_copy_safety.py -q"
          ],
          qualityAudit: [
            "reference ES leakage",
            "AI-smell phrase regression",
            "Japanese tone and conclusion-first structure",
            "token/cost impact"
          ]
        }
      }' > "$PROMPT_STATE_DIR/prompt-review-pending-$SESSION_ID.json"
    rm -f "$PROMPT_STATE_DIR/prompt-review-pending-$SESSION_ID" "$PROMPT_STATE_DIR/prompt-review-confirmed-$SESSION_ID" "$PROMPT_STATE_DIR/prompt-review-confirmed-$SESSION_ID.json"
    cat >&2 <<'EOF'
Codex prompt/LLM reminder: prompt quality verification is now required before commit.
EOF
    ;;
  esac

  case "$REL_PATH" in
  *.ts|*.tsx|*.py)
    STATE_DIR=$(codex_session_state_dir)
    COUNTER_FILE="$STATE_DIR/edit-count-$SESSION_ID"
    COUNT=$(python3 - <<'PY' "$COUNTER_FILE"
from pathlib import Path
import sys
path = Path(sys.argv[1])
try:
    print(path.read_text(encoding="utf-8").strip() or "0")
except FileNotFoundError:
    print("0")
PY
)
    COUNT=$((COUNT + 1))
    printf '%s\n' "$COUNT" > "$COUNTER_FILE"
    if [ $((COUNT % 5)) -eq 0 ]; then
      cat >&2 <<EOF
Codex maintainability reminder: TS/TSX/PY edit count is ${COUNT}. Check dead code, unused imports, and oversized files.
EOF
    fi
    ;;
  esac

  if printf '%s' "$REL_PATH" | grep -qE '^src/(components/|app/(.*/)?(page|layout|loading)\.tsx$)' && ! printf '%s' "$REL_PATH" | grep -qE '^src/app/api/'; then
    UI_REMIND_DIR=$(codex_session_state_dir)
    UI_REMIND_FLAG="$UI_REMIND_DIR/ui-reminded-$SESSION_ID"
    if [ ! -f "$UI_REMIND_FLAG" ]; then
      : > "$UI_REMIND_FLAG"
      cat >&2 <<EOF
Codex UI reminder: edited UI file $REL_PATH (shown once per session).
  Suggested: npm run lint:ui:guardrails / npm run test:ui:review -- <route>
  Details: docs/architecture/FRONTEND_UI_GUIDELINES.md
EOF
    fi
  fi

  if printf '%s' "$REL_PATH" | grep -qE '^src/lib/db/schema\.ts$'; then
  cat >&2 <<'EOF'
Codex DB reminder: schema.ts changed. Run npm run db:generate and review the generated SQL.
EOF
  fi

  if printf '%s' "$REL_PATH" | grep -qE '\.(test|spec)\.(ts|tsx)$' && ! printf '%s' "$REL_PATH" | grep -qE '^e2e/'; then
    cat >&2 <<EOF
Codex test reminder: run npm run test:unit -- --run $REL_PATH
EOF
  fi

  if printf '%s' "$REL_PATH" | grep -qE '^e2e/.*\.spec\.ts$'; then
    cat >&2 <<EOF
Codex E2E reminder: run npm run test:e2e -- $REL_PATH
EOF
  fi

  if printf '%s' "$REL_PATH" | grep -qE '^backend/tests/.*\.py$'; then
    cat >&2 <<EOF
Codex pytest reminder: cd backend && pytest $REL_PATH -x --tb=short
EOF
  fi
  # Quality Gate hints (fail-open: engine failure must NOT affect existing hooks)
  QG_ENGINE="$PROJECT_DIR/.codex/hooks/lib/quality-gate-engine.sh"
  if [ ! -f "$QG_ENGINE" ]; then
    QG_ENGINE="$PROJECT_DIR/.claude/hooks/lib/quality-gate-engine.sh"
  fi
  if [ -f "$QG_ENGINE" ]; then
    (
      # shellcheck source=lib/quality-gate-engine.sh
      . "$QG_ENGINE" 2>/dev/null &&
      qg_maybe_emit_hint "$REL_PATH" "$SESSION_ID"
    ) || true
  fi

done <<< "$FILES"

exit 0
