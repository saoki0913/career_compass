#!/bin/bash
# PreToolUse dispatcher: run expensive/specific guards only when the tool input can trigger them.
set -euo pipefail

INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

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

    # Scoped after a blocking security audit. A blanket removal opened a
    # CRITICAL bypass: $()/backtick/$VAR defeat the pre-expansion
    # literal-text predicates. Re-block shell expansion ONLY when the
    # command also touches a dangerous surface; benign read-only
    # diagnostics (`grep "$(date)"`, `echo "$(whoami)"`) still pass.
    # Also block `$VAR` used as the command name after a shell separator
    # (`G=git; $G push`), because later literal guards cannot see it.
    guard_expansion_atom='(\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9]+|\$[@*#?$!-]|\$\{[^}]+\}|\$\([^)]+\)|`[^`]+`)'
    guard_command_position_expansion="(^|[;&|(){}][[:space:]]*)\"?(${guard_expansion_atom})+\"?([[:space:]]|$)"
    guard_expansion_before_recursive="(${guard_expansion_atom})+.*[[:space:]](-[A-Za-z]*r[A-Za-z]*|--recursive)([[:space:]]|$)"
    guard_dangerous_expansion_surface="diff-snapshot\.mjs|checkpoint|(^|[^a-z])git[[:space:]]|(^|[^a-z])rm[[:space:]]|${guard_command_position_expansion}|${guard_expansion_before_recursive}|(^|[[:space:]])push([[:space:]]|$)|[[:space:]]-rf([[:space:]]|$)|[[:space:]]shred([[:space:]]|$)|[[:space:]]dd[[:space:]]|\.env|\.secrets|\.pem|\.key|\.p12|deploy-production|deploy-staging|deploy-stage|sync-career-compass-secrets|release-career-compass|run-migrations|ops-secrets|db:push|db:migrate|drizzle|supabase|vercel|railway|gcloud|wrangler|sentry|stripe|(^|[^a-z])(make|npm|pnpm|yarn|npx|bash|sh|zsh|node|env|eval|xargs|command|exec|sudo|nohup|nice|time|noglob|nocorrect)[[:space:]]"
    if guard_command_has_unsafe_shell_expansion "$CMD" \
      && printf '%s' "$CMD" | grep -qiE "$guard_dangerous_expansion_surface"; then
      cat >&2 <<'EOF'
⛔ シェル展開（$()/backtick/$VAR/process substitution）を含み、かつ push/commit/削除/secret/.env/deploy/migration/checkpoint/各種ランナー等の危険操作面に触れるため安全に分類できません。展開を使わず、明示的な引数に分解して実行してください（読み取り専用の grep "$(date)" 等は引き続き許可されます）。
EOF
      exit 2
    fi

    if guard_command_reads_sensitive_path "$CMD"; then
      run_hook "secrets-guard.sh"
    fi

    if guard_command_is_git_push "$CMD"; then
      run_hook "git-push-guard.sh"
    fi

    if guard_command_is_git_branch_create "$CMD"; then
      run_hook "git-branch-guard.sh"
    fi

    if guard_command_has_destructive_delete "$CMD"; then
      run_hook "destructive-rm-guard.sh"
    fi

    if guard_command_is_migration_apply "$CMD"; then
      run_hook "migration-safety-guard.sh"
    fi

    if guard_command_is_production_promotion "$CMD"; then
      run_hook "production-promotion-guard.sh"
    fi

    if guard_command_is_secret_apply_production "$CMD"; then
      run_hook "secret-apply-guard.sh"
    fi

    if guard_command_is_release_or_provider "$CMD"; then
      run_hook "release-provider-guard.sh"
    fi

    if printf '%s' "$CMD" | grep -qE '(^|[^a-zA-Z_])git[[:space:]]+commit'; then
      if [ -f "$PROJECT_DIR/.claude/hooks/quality-gate-commit-check.sh" ]; then
        run_hook "quality-gate-commit-check.sh"
      fi
      run_hook "commit-codex-gate.sh"
    fi

    if guard_command_is_test_category "$CMD"; then
      run_hook "test-category-gate.sh"
    fi

    if printf '%s' "$CMD" | grep -qE 'delegate\.sh[[:space:]]+(plan_review|post_review)'; then
      run_hook "codex-delegate-gate.sh"
    fi
    ;;

  Read|mcp__filesystem__*)
    if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
      run_hook "secrets-guard.sh"
    fi
    ;;

  apply_patch|Edit|Write|MultiEdit)
    run_hook "impl-start-codex-gate.sh"
    run_hook "prompt-edit-confirm-guard.sh"
    run_hook "bandaid-guard.sh"
    run_hook "tdd-enforcement-guard.sh"
    ;;

  ExitPlanMode)
    run_hook "exit-plan-codex-gate.sh"
    ;;
esac

exit 0
