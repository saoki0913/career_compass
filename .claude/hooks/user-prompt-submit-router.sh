#!/bin/bash
# UserPromptSubmit: add lightweight static routing hints before Claude starts.
set -euo pipefail

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')

if [ -z "$PROMPT" ]; then
  exit 0
fi

LOWER=$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')

if printf '%s' "$PROMPT" | grep -qiE 'codex-company/\.secrets|直接.*secret|read.*secret'; then
  jq -n '{
    decision: "block",
    reason: "secrets の実ファイル直接参照は許可していません。scripts/release/sync-career-compass-secrets.sh --check を使ってください。"
  }'
  exit 0
fi

CONTEXT=""
TITLE=""

if printf '%s' "$LOWER" | grep -qE 'deploy|release|production|staging|ship it|本番|公開|リリース'; then
  CONTEXT="${CONTEXT}Release 系依頼です。release-engineer を優先し、make deploy / make ops-release-check / scripts/release/release-career-compass.sh を正本として扱ってください.\n"
  TITLE="Release Task"
fi

# 機能改善 / 新機能追加 / リファクタ系依頼 — 着手前に architecture-gate を回す
if printf '%s' "$PROMPT" | grep -qE '機能.*改善|改善して|機能.*追加|新機能|新しい機能|リファクタ|refactor|大規模|まとめて.*直|横断|境界.*変更|責務.*分離'; then
  CONTEXT="${CONTEXT}機能改善 / 新機能追加 / リファクタ系の依頼の可能性があります。着手前に architecture-gate skill を回し、PASS / PASS_WITH_REFACTOR / BLOCK を判定してください。BLOCK の場合は improve-architecture skill で RFC 化を先に行うこと。実装後は code-reviewer skill を必ず通すこと.\n"
  [ -z "$TITLE" ] && TITLE="Architecture Improvement Task"
fi

# hotspot ファイル名 / ディレクトリの言及 — 直接的な負債領域への変更
if printf '%s' "$PROMPT" | grep -qE 'es_review\.py|es_templates\.py|company_info\.py|utils/llm\.py|CorporateInfoSection|ReviewPanel|useESReview|app-loaders'; then
  CONTEXT="${CONTEXT}hotspot ファイルへの変更依頼の可能性があります（AI_DEVELOPMENT_PRINCIPLES.md 列挙）。継ぎ足し追記の前に refactoring-specialist skill で分離可否を判定し、必要なら maintainability-review skill で全体影響を確認してください.\n"
  [ -z "$TITLE" ] && TITLE="Hotspot Edit Task"
fi

# レビュー / 監査依頼の明示
if printf '%s' "$PROMPT" | grep -qE '保守性|maintainability|品質.*レビュー|品質.*監査|アーキテクチャ.*レビュー|コードレビュー'; then
  CONTEXT="${CONTEXT}レビュー / 監査系依頼です。保守性は maintainability-review skill、機能/セキュリティ横断は quality-review skill、PR 前監査は code-reviewer skill を使い分けてください.\n"
  [ -z "$TITLE" ] && TITLE="Review Task"
fi

if printf '%s' "$PROMPT" | grep -qE 'backend/app/prompts/|utils/llm\.py|プロンプト|ES添削|志望動機|ガクチカ|A/B'; then
  CONTEXT="${CONTEXT}Prompt 系依頼です。prompt-engineer を優先し、ai-writing-auditor と llm-architect を併用してください.\n"
  [ -z "$TITLE" ] && TITLE="Prompt Task"
fi

if printf '%s' "$PROMPT" | grep -qE 'src/components/|page\.tsx|layout\.tsx|loading\.tsx|UI|LP|デザイン|見た目'; then
  CONTEXT="${CONTEXT}UI 系依頼です。ui-designer を優先し、ui:preflight -> lint:ui:guardrails -> test:ui:review の順を守ってください.\n"
  [ -z "$TITLE" ] && TITLE="UI Task"
fi

if printf '%s' "$PROMPT" | grep -qE 'auth|csrf|stripe|webhook|security|セキュリティ'; then
  CONTEXT="${CONTEXT}Security 系依頼です。security-auditor を優先し、guest/user 境界と成功時のみ消費を確認してください.\n"
  [ -z "$TITLE" ] && TITLE="Security Task"
fi

if printf '%s' "$PROMPT" | grep -qE 'docs/|review|レビュー|update-docs|ドキュメント'; then
  CONTEXT="${CONTEXT}Docs / review 系依頼です。レビュー作成は quality-review skill、計画作成は improvement-plan skill を参照してください.\n"
  [ -z "$TITLE" ] && TITLE="Docs Task"
fi

if [ -z "$CONTEXT" ] && printf '%s' "$PROMPT" | grep -qE 'src/app/api/|backend/app/routers/|schema\.ts|cross-cutting|横断'; then
  CONTEXT="横断変更の可能性があります。architect を起点にし、必要なら architecture-gate を先に回してください."
  [ -z "$TITLE" ] && TITLE="Architecture Task"
fi

if [ -z "$CONTEXT" ]; then
  exit 0
fi

jq -n --arg ctx "$CONTEXT" --arg title "$TITLE" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $ctx,
    sessionTitle: $title
  }
}'
