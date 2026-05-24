#!/bin/bash
# PreToolUse dispatcher: keep runtime hook status concise and invoke only relevant guards.
set -euo pipefail

INPUT=$(cat)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/codex-hook-utils.sh
. "$SCRIPT_DIR/lib/codex-hook-utils.sh"

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)
CMD=$(codex_tool_command "$INPUT")
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // .file_path // empty' 2>/dev/null || true)
PROJECT_DIR=$(codex_project_dir "$INPUT")
# shellcheck source=../../scripts/harness/guard-core.sh
. "$PROJECT_DIR/scripts/harness/guard-core.sh"

run_hook() {
  local hook_name="$1"
  printf '%s' "$INPUT" | bash "$SCRIPT_DIR/$hook_name"
}

case "$TOOL" in
  Bash|"")
    if [ -z "$CMD" ]; then
      exit 0
    fi

    # Scoped after a blocking security audit. A blanket removal opened a
    # CRITICAL bypass: $()/backtick/$VAR defeat the pre-expansion
    # literal-text predicates (e.g. `K=push; diff-snapshot.mjs checkpoint
    # --kind $K` forges an approval; `make $(echo deploy-production)`;
    # `G=git; $G push` hides the command name from literal predicates).
    # Re-block shell expansion ONLY when the command also touches a
    # dangerous surface, so benign read-only diagnostics (`grep "$(date)"`,
    # `echo "$(whoami)"`) still pass.
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

    if guard_command_creates_protected_checkpoint "$CMD"; then
      cat >&2 <<'EOF'
⛔ Codex から承認系 checkpoint を直接作成することはできません。
push / release / migration / production-promotion / secret-apply / staging-verified / codex-autonomy など危険操作を許可する記録は、該当ガードまたは Codex 自律 manifest の内部処理に任せてください。
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

    if guard_command_is_git_commit "$CMD"; then
      if [ -f "$SCRIPT_DIR/quality-gate-commit-check.sh" ]; then
        run_hook "quality-gate-commit-check.sh"
      fi
      run_hook "commit-codex-gate.sh"
    fi

    if guard_command_is_test_category "$CMD"; then
      run_hook "test-category-gate.sh"
    fi
    ;;

  Read|mcp__filesystem__*)
    if [ -n "$FILE_PATH" ] && guard_path_is_sensitive "$FILE_PATH"; then
      run_hook "secrets-guard.sh"
    fi
    ;;

  apply_patch|Edit|Write)
    run_hook "prompt-edit-confirm-guard.sh"
    run_hook "bandaid-guard.sh"
    ;;
esac

exit 0
