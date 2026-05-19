#!/bin/bash
# UserPromptSubmit: add lightweight routing and workflow context for Codex.
set -euo pipefail

INPUT=$(cat)
PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)

if [ -z "$PROMPT" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

LOWER=$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')
IS_HARNESS_DIAGNOSTIC=false
if printf '%s' "$PROMPT" | grep -qiE 'hook|hooks|harness|PreToolUse|PostToolUse|UserPromptSubmit|PermissionRequest|Checking git push|Checking test category|Checking commit review|進まない|止ま'; then
  if printf '%s' "$PROMPT" | grep -qiE 'なんで|なぜ|why|おかしい|設計|改善|直|fix|debug|diagnos'; then
    IS_HARNESS_DIAGNOSTIC=true
  fi
fi

CONTEXT=""

if [ "$IS_HARNESS_DIAGNOSTIC" = "true" ]; then
  CONTEXT="${CONTEXT}Hook / harness diagnostic task: inspect lifecycle hook routing, reduce noisy always-on guards, and keep safety gates intact. Do not treat this as an ordinary product feature implementation.\n"
fi

if printf '%s' "$LOWER" | grep -qE 'deploy|release|production|staging|ship it|本番|公開|リリース'; then
  CONTEXT="${CONTEXT}Release task: prefer release-engineer guidance and repo scripts such as make ops-release-check / make deploy / scripts/release/release-career-compass.sh.\n"
fi

if [ "$IS_HARNESS_DIAGNOSTIC" != "true" ] \
  && [ -n "$SESSION_ID" ] \
  && printf '%s' "$LOWER" | grep -qE '(^|[^a-z0-9])(deploy|release|ship it|push)([^a-z0-9]|$)|本番.*(デプロイ|反映|公開|リリース)|公開して|リリースして|デプロイして|プッシュして|本番まで|本番に'; then
  STATE_DIR=$(codex_session_state_dir)
  INTENT_FILE="$STATE_DIR/autonomy-intent-$SESSION_ID.json"

  # Explicit JP/EN negation tokens (single case-insensitive alternation).
  # Any match REVOKES any previously granted budget (scope-change
  # revocation: "later in the session the user said don't push") and
  # suppresses creating a new intent.
  NEGATION_RE='do not (push|deploy|release)|don'\''t (push|deploy|release)|no (push|deploy|release)|no need to (deploy|push|release|promote)|no prod|not to prod|not yet|without (pushing|deploying|releasing)|skip (the deploy|deploy|push)|hold off|dry[ -]?run only|プッシュしない|プッシュせず|押さない|デプロイしない|デプロイせず|リリースしない|リリースせず|公開しない|反映しない|本番に出さない|本番には出さない|本番反映しない|本番はしない|本番なし|本番(は|が|に|へ)?(まだ|あと|後で|後|ない|せず|不要|なし)|(デプロイ|リリース|公開|反映)(は)?(まだ|あと|後で|後|不要|しない|せず)|(まだ|あとで|後で)(は)?(デプロイ|リリース|公開|反映|プッシュ|push)|(まず|先に)[^。]{0,8}(push|プッシュ)(だけ|のみ|して)?|push *はしない|push *しないで|まだ(出さない|push|プッシュ|デプロイ)|ドライラン|確認だけ|見るだけ'
  if printf '%s' "$PROMPT" | grep -qiE "$NEGATION_RE"; then
    rm -f "$INTENT_FILE"
  else
    # WANT_PROD requires an AFFIRMATIVE production-promotion verb (not a
    # bare `本番`/`production` substring, which over-granted a
    # production-promotion budget on prompts like "push して、本番はまだ").
    # Also excluded when a not-yet/later qualifier sits on the prod term.
    WANT_PROD=false
    if printf '%s' "$LOWER" | grep -qiE 'ship it|本番(へ|に|まで)?(反映|公開|デプロイ|リリース|出す|出して|プロモート)|本番(まで|に)(出|反映|公開|デプロイ|リリース)|(deploy|release|promote)[^.]*(to )?prod(uction)?|prod(uction)?[^.]*(deploy|release|promot)' \
      && ! printf '%s' "$LOWER" | grep -qiE '本番(は|が|に|へ)?(まだ|あと|後で|後|ない|せず|不要|なし)|prod(uction)?[^.]*(not yet|later|no need)'; then
      WANT_PROD=true
    fi

    WANT_RELEASE=false
    if printf '%s' "$LOWER" | grep -qiE 'deploy|release|ship it|デプロイ|リリース|公開|本番'; then
      WANT_RELEASE=true
    fi

    # Taxonomy-derived sets — SSOT is command-classifier.mjs `taxonomy`.
    # Router POLICY selects the subset. A plain push intent must never grant
    # release/deploy permission; release actions require explicit deploy /
    # release wording, and production-promotion still requires WANT_PROD.
    REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
    TAXO=$(node "$REPO_ROOT/scripts/harness/command-classifier.mjs" taxonomy 2>/dev/null || true)
    if [ -n "$TAXO" ]; then
      if [ "$WANT_PROD" = "true" ]; then
        ACTIONS=$(printf '%s' "$TAXO" | jq -c '[.actions[] | select(. != "migration")]')
        RELEASE_MODES=$(printf '%s' "$TAXO" | jq -c '[.releaseModes[] | select(. != "provider")]')
      elif [ "$WANT_RELEASE" = "true" ]; then
        ACTIONS=$(printf '%s' "$TAXO" | jq -c '[.actions[] | select(. != "migration" and . != "production-promotion")]')
        RELEASE_MODES=$(printf '%s' "$TAXO" | jq -c '[.releaseModes[] | select(. == "staging" or . == "release")]')
      else
        ACTIONS=$(printf '%s' "$TAXO" | jq -c '[.actions[] | select(. == "test" or . == "push")]')
        RELEASE_MODES='[]'
      fi
    else
      # Fail-safe: classifier unavailable -> minimal legacy sets.
      if [ "$WANT_PROD" = "true" ]; then
        ACTIONS='["test","push","release","production-promotion"]'
        RELEASE_MODES='["staging","production","release"]'
      elif [ "$WANT_RELEASE" = "true" ]; then
        ACTIONS='["test","push","release"]'
        RELEASE_MODES='["staging","release"]'
      else
        ACTIONS='["test","push"]'
        RELEASE_MODES='[]'
      fi
    fi

    # TTL: production / ship-it grants expire faster (2h) than non-prod (4h).
    if [ "$WANT_PROD" = "true" ]; then TTL_S=7200; else TTL_S=14400; fi
    EXPIRES_AT=$(date -u -v+"${TTL_S}"S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

    # Do NOT ratchet TTL: keep an existing, non-expired intent unless this
    # is a genuine escalation (live non-prod intent + prod now requested).
    WRITE_INTENT=true
    if [ -f "$INTENT_FILE" ]; then
      EXISTING_STATE=$(jq -r 'if ((.expiresAt // "") != "" and ((.expiresAt | fromdateiso8601) > now)) then "live" else "stale" end' "$INTENT_FILE" 2>/dev/null || echo "stale")
      HAS_PROD=$(jq -r '(((.actions // []) | index("production-promotion")) != null)' "$INTENT_FILE" 2>/dev/null || echo "false")
      if [ "$EXISTING_STATE" = "live" ]; then
        if [ "$WANT_PROD" != "true" ] || [ "$HAS_PROD" = "true" ]; then
          WRITE_INTENT=false
        fi
      fi
    fi

    if [ "$WRITE_INTENT" = "true" ]; then
      jq -n \
        --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg expiresAt "$EXPIRES_AT" \
        --arg promptHash "$(printf '%s' "$PROMPT" | shasum -a 256 | awk '{print $1}')" \
        --argjson actions "$ACTIONS" \
        --argjson releaseModes "$RELEASE_MODES" \
        '{
          schemaVersion: 1,
          kind: "codex-autonomy-intent",
          decision: "approved",
          issuer: "codex-user-prompt-router",
          createdAt: $createdAt,
          expiresAt: $expiresAt,
          promptHash: $promptHash,
          actions: $actions,
          releaseModes: $releaseModes
        }' > "$INTENT_FILE"
    fi
  fi
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
