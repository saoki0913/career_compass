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

  case "$path" in
    */codex-company/.secrets/*|codex-company/.secrets/*|*/.secrets/*|.secrets/*) return 0 ;;
    */secrets/*|secrets/*) return 0 ;;
    .env|.env.*|*/.env|*/.env.*) return 0 ;;
    *.pem|*.key|*.p12) return 0 ;;
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

guard_command_is_force_push() {
  local command="${1:-}"
  guard_command_predicate "$command" "forcePush"
}

guard_command_is_git_commit() {
  local command="${1:-}"
  guard_command_predicate "$command" "gitCommit"
}

guard_command_is_release_or_provider() {
  local command="${1:-}"
  guard_command_predicate "$command" "releaseProvider"
}

guard_command_has_destructive_delete() {
  local command="${1:-}"
  guard_command_predicate "$command" "destructiveDelete"
}

guard_rm_rf_all_targets_safe() {
  local command="${1:-}"
  guard_command_predicate "$command" "allDeletesSafe"
}

guard_state_dir_for_runtime() {
  local runtime="${1:-claude}"
  case "$runtime" in
    codex) mkdir -p "$HOME/.codex/sessions/career_compass"; printf '%s\n' "$HOME/.codex/sessions/career_compass" ;;
    *) mkdir -p "$HOME/.claude/sessions/career_compass"; printf '%s\n' "$HOME/.claude/sessions/career_compass" ;;
  esac
}
