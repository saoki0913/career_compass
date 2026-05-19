#!/bin/bash
# Shared safety predicates for Claude/Codex lifecycle hooks.

if [ -n "${__CAREER_COMPASS_GUARD_CORE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__CAREER_COMPASS_GUARD_CORE_SOURCED=1

guard_command_segments() {
  local command="${1:-}"
  node "$(dirname "${BASH_SOURCE[0]}")/command-classifier.mjs" "$command" | jq -r '.segments[]? // empty' 2>/dev/null || true
}

guard_command_predicate() {
  local command="${1:-}"
  local predicate="${2:-}"
  if [ -z "$command" ] || [ -z "$predicate" ]; then
    return 1
  fi
  node "$(dirname "${BASH_SOURCE[0]}")/command-classifier.mjs" "$command" "$predicate" >/dev/null 2>&1
}

guard_command_release_modes() {
  local command="${1:-}"
  [ -z "$command" ] && return 0
  node "$(dirname "${BASH_SOURCE[0]}")/command-classifier.mjs" "$command" | jq -r '.releaseModes[]?' 2>/dev/null || true
}

guard_path_is_sensitive() {
  local path="${1:-}"
  [ -z "$path" ] && return 1

  # Real secret store and key material always win, even if named *.example.
  case "$path" in
    */codex-company/.secrets/*|codex-company/.secrets/*|*/.secrets/*|.secrets/*) return 0 ;;
    */secrets/*|secrets/*) return 0 ;;
    *.pem|*.key|*.p12) return 0 ;;
  esac

  # Env/secret templates carry only placeholders and are git-tracked, so they
  # must remain editable. Real secret files never use the .env.example suffix
  # and secrets-examples/ is the tracked template directory.
  case "$path" in
    *.env.example|*/secrets-examples/*|secrets-examples/*) return 1 ;;
  esac

  case "$path" in
    .env|.env.*|*/.env|*/.env.*) return 0 ;;
  esac

  return 1
}

guard_command_reads_sensitive_path() {
  local command="${1:-}"
  guard_command_predicate "$command" "readsSensitivePath"
}

guard_command_is_git_push() {
  local command="${1:-}"
  guard_command_predicate "$command" "gitPush"
}

guard_command_is_allowed_git_push_target() {
  local command="${1:-}"
  guard_command_predicate "$command" "gitPushAllowedTarget"
}

guard_command_git_push_remote() {
  local command="${1:-}"
  node "$(dirname "${BASH_SOURCE[0]}")/command-classifier.mjs" "$command" | jq -r '.gitPushRemote // empty' 2>/dev/null || true
}

guard_command_git_push_refspec() {
  local command="${1:-}"
  node "$(dirname "${BASH_SOURCE[0]}")/command-classifier.mjs" "$command" | jq -r '.gitPushRefspecs[0] // empty' 2>/dev/null || true
}

guard_command_is_force_push() {
  local command="${1:-}"
  guard_command_predicate "$command" "forcePush"
}

guard_command_is_git_commit() {
  local command="${1:-}"
  guard_command_predicate "$command" "gitCommit"
}

guard_command_is_git_branch_create() {
  local command="${1:-}"
  guard_command_predicate "$command" "gitBranchCreate"
}

guard_command_is_release_or_provider() {
  local command="${1:-}"
  guard_command_predicate "$command" "releaseProvider"
}

guard_command_is_release_read_only() {
  local command="${1:-}"
  guard_command_predicate "$command" "releaseReadOnly"
}

guard_command_is_release_mutating() {
  local command="${1:-}"
  guard_command_predicate "$command" "releaseMutating"
}

guard_command_is_test_category() {
  local command="${1:-}"
  guard_command_predicate "$command" "testCategoryCommand"
}

guard_command_has_destructive_delete() {
  local command="${1:-}"
  guard_command_predicate "$command" "destructiveDelete"
}

guard_rm_rf_all_targets_safe() {
  local command="${1:-}"
  guard_command_predicate "$command" "allDeletesSafe"
}

guard_command_is_migration_apply() {
  local command="${1:-}"
  guard_command_predicate "$command" "migrationApply"
}

guard_command_is_production_promotion() {
  local command="${1:-}"
  guard_command_predicate "$command" "productionPromotion"
}

guard_command_is_secret_apply_production() {
  local command="${1:-}"
  guard_command_predicate "$command" "secretApplyProduction"
}

guard_command_has_unsafe_shell_expansion() {
  local command="${1:-}"
  guard_command_predicate "$command" "unsafeShellExpansion"
}

guard_command_creates_protected_checkpoint() {
  local command="${1:-}"
  guard_command_predicate "$command" "protectedCheckpoint"
}

guard_state_dir_for_runtime() {
  local runtime="${1:-claude}"
  case "$runtime" in
    codex) mkdir -p "$HOME/.codex/sessions/career_compass"; printf '%s\n' "$HOME/.codex/sessions/career_compass" ;;
    *) mkdir -p "$HOME/.claude/sessions/career_compass"; printf '%s\n' "$HOME/.claude/sessions/career_compass" ;;
  esac
}
