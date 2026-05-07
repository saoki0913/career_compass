#!/bin/bash
# UserPromptSubmit: add lightweight routing and workflow context for Codex.
set -euo pipefail

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)

if [ -z "$PROMPT" ]; then
  exit 0
fi

LOWER=$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')
IS_HARNESS_DIAGNOSTIC=false
if printf '%s' "$PROMPT" | grep -qiE 'hook|hooks|harness|PreToolUse|PostToolUse|UserPromptSubmit|PermissionRequest|Checking git push|Checking test category|Checking commit review|進まない|止ま'; then
  if printf '%s' "$PROMPT" | grep -qiE 'なんで|なぜ|why|おかしい|設計|改善|直|fix|debug|diagnos'; then
    IS_HARNESS_DIAGNOSTIC=true
  fi
fi

if printf '%s' "$PROMPT" | grep -qiE 'codex-company/\.secrets|直接.*secret|read.*secret'; then
  jq -n '{
    decision: "block",
    reason: "Direct secret file access is blocked. Use scripts/release/sync-career-compass-secrets.sh --check."
  }'
  exit 0
fi

CONTEXT=""

if [ "$IS_HARNESS_DIAGNOSTIC" = "true" ]; then
  CONTEXT="${CONTEXT}Hook / harness diagnostic task: inspect lifecycle hook routing, reduce noisy always-on guards, and keep safety gates intact. Do not treat this as an ordinary product feature implementation.\n"
fi

if printf '%s' "$LOWER" | grep -qE 'deploy|release|production|staging|ship it|本番|公開|リリース'; then
  CONTEXT="${CONTEXT}Release task: prefer release-engineer guidance and repo scripts such as make ops-release-check / make deploy / scripts/release/release-career-compass.sh.\n"
fi

if [ "$IS_HARNESS_DIAGNOSTIC" != "true" ] && printf '%s' "$PROMPT" | grep -qE '機能.*改善|改善して|機能.*追加|新機能|新しい機能|リファクタ|refactor|大規模|まとめて.*直|横断|境界.*変更|責務.*分離'; then
  CONTEXT="${CONTEXT}Architecture-impacting task: use architecture-gate before broad implementation and code-reviewer after implementation.\n"
fi

if printf '%s' "$PROMPT" | grep -qE 'es_review\.py|es_templates\.py|company_info\.py|utils/llm\.py|CorporateInfoSection|ReviewPanel|useESReview|app-loaders'; then
  CONTEXT="${CONTEXT}Hotspot edit likely: check refactoring-specialist / maintainability-review guidance before adding more responsibility.\n"
fi

if printf '%s' "$PROMPT" | grep -qE 'backend/app/prompts/|utils/llm\.py|プロンプト|ES添削|志望動機|ガクチカ|A/B'; then
  CONTEXT="${CONTEXT}Prompt task: prefer prompt-engineer guidance and include AI output-quality verification.\n"
fi

if printf '%s' "$PROMPT" | grep -qE 'src/components/|page\.tsx|layout\.tsx|loading\.tsx|UI|LP|デザイン|見た目'; then
  CONTEXT="${CONTEXT}UI task: prefer the ui-designer agent. Optionally run ui:preflight when design decisions matter. After edits, lint:ui:guardrails and test:ui:review -- <route> are recommended.\n"
fi

if printf '%s' "$PROMPT" | grep -qE 'auth|csrf|stripe|webhook|security|セキュリティ'; then
  CONTEXT="${CONTEXT}Security-sensitive task: prioritize security-auditor guidance, guest/user ownership, CSRF, webhooks, and success-only credit consumption.\n"
fi

if [ "$IS_HARNESS_DIAGNOSTIC" != "true" ] && printf '%s' "$LOWER" | grep -qE '実装|追加して|作って|修正して|変更して|直して|対応して|改善して|組み込|入れて|書いて|更新して|fix|implement|build|create|refactor|add.*feature|update.*to'; then
  if ! printf '%s' "$LOWER" | grep -qE '^(何|どう|なぜ|how|what|why|explain|教えて|確認)'; then
    CONTEXT="${CONTEXT}Implementation-sized task: establish a short plan and verification commands before editing.\n"
  fi
fi

if [ -z "$CONTEXT" ]; then
  exit 0
fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $ctx
  }
}'
