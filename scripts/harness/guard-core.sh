#!/bin/bash
# Shared safety predicates for Claude/Codex lifecycle hooks.

if [ -n "${__CAREER_COMPASS_GUARD_CORE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__CAREER_COMPASS_GUARD_CORE_SOURCED=1

guard_command_segments() {
  local command="${1:-}"
  python3 - "$command" <<'PY'
import re
import sys

command = sys.argv[1].replace("\n", " ")
command = re.sub(r"'([^'\\]|\\.)*'", "''", command)
command = re.sub(r'"([^"\\]|\\.)*"', '""', command)
for segment in re.split(r"[;&|]+", command):
    segment = segment.strip()
    if segment:
        print(segment)
PY
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
  [ -z "$command" ] && return 1

  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if printf '%s' "$segment" | grep -qE '(^|[[:space:]])(cat|head|tail|less|more|bat|sed|awk|grep|rg)([[:space:]]|$)'; then
      if printf '%s' "$segment" | grep -qE '(^|[[:space:]])([^[:space:]]*/)?(codex-company/\.secrets|\.secrets|secrets)(/|[[:space:]]|$)|(^|[[:space:]])([^[:space:]]*/)?\.env([^/[:space:]]*)?([[:space:]]|$)|\.(pem|key|p12)([[:space:]]|$)'; then
        return 0
      fi
    fi
  done < <(guard_command_segments "$command")

  return 1
}

guard_command_is_git_push() {
  local command="${1:-}"
  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if printf '%s' "$segment" | grep -qE '^(git|sudo[[:space:]]+git)[[:space:]]+push([[:space:]]|$)'; then
      return 0
    fi
  done < <(guard_command_segments "$command")
  return 1
}

guard_command_is_force_push() {
  local command="${1:-}"
  guard_command_is_git_push "$command" || return 1
  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if printf '%s' "$segment" | grep -qE '^(git|sudo[[:space:]]+git)[[:space:]]+push([[:space:]].*)?(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
      return 0
    fi
  done < <(guard_command_segments "$command")
  return 1
}

guard_command_is_release_or_provider() {
  local command="${1:-}"
  [ -z "$command" ] && return 1

  while IFS= read -r segment; do
    [ -z "$segment" ] && continue
    if printf '%s' "$segment" | grep -qE '^(make[[:space:]]+(deploy|deploy-stage-all|release-pr|rollback-prod|ops-release-check|deploy-migrate)([[:space:]]|$)|([[:alnum:]_./-]+/)?scripts/release/[^[:space:]]+|bash[[:space:]]+scripts/release/[^[:space:]]+|zsh[[:space:]]+scripts/release/[^[:space:]]+|(vercel|railway|supabase|gcloud|wrangler)([[:space:]]|$))'; then
      return 0
    fi
  done < <(guard_command_segments "$command")

  return 1
}

guard_command_has_destructive_delete() {
  local command="${1:-}"
  [ -z "$command" ] && return 1

  printf '%s' "$command" | grep -qE '(^|[;&|]|`|\$\()[[:space:]]*(rm[[:space:]]+(-[a-zA-Z]*r|-[a-zA-Z]*f[a-zA-Z]*r|-r([[:space:]]|$))|git[[:space:]]+clean[[:space:]].*(-x|-[a-zA-Z]*x)|find[[:space:]].*-delete)'
}

guard_rm_rf_all_targets_safe() {
  local command="${1:-}"
  local safe_targets='(node_modules|\.next|build|dist|__pycache__|coverage|\.turbo|\.cache|\.pytest_cache|\.mypy_cache|\.ruff_cache|out|\.parcel-cache|\.vercel|target|tmp|\.output|\.nuxt|\.svelte-kit)'
  local targets

  targets=$(printf '%s' "$command" | grep -oE '(^|[;&|]|`|\$\()[[:space:]]*rm[[:space:]]+[^;&|]*' | sed -E 's/.*rm[[:space:]]+//' | tr ' ' '\n' | grep -v '^-' | grep -v '^$' || true)
  [ -z "$targets" ] && return 1

  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      /*|.|..|../*|~|~/*) return 1 ;;
    esac
    local basename_target
    basename_target=$(basename "${target%/}")
    printf '%s' "$basename_target" | grep -qE "^${safe_targets}$" || return 1
  done <<< "$targets"

  return 0
}

guard_state_dir_for_runtime() {
  local runtime="${1:-claude}"
  case "$runtime" in
    codex) mkdir -p "$HOME/.codex/sessions/career_compass"; printf '%s\n' "$HOME/.codex/sessions/career_compass" ;;
    *) mkdir -p "$HOME/.claude/sessions/career_compass"; printf '%s\n' "$HOME/.claude/sessions/career_compass" ;;
  esac
}
