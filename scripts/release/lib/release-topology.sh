#!/bin/zsh
#
# Shared release topology for branch -> logical env -> provider target mapping.
# Runtime code must use APP_ENV/NEXT_PUBLIC_APP_ENV for application behavior;
# provider project/environment names are release metadata only.

set -euo pipefail

TOPOLOGY_BRANCH_STAGING="develop"
TOPOLOGY_BRANCH_PRODUCTION="main"

TOPOLOGY_VERCEL_ENV_SCOPE="production"
TOPOLOGY_RAILWAY_ENVIRONMENT_NAME="production"

TOPOLOGY_TARGETS_STAGING=(
  vercel-staging
  railway-staging
  supabase-staging
  github
)

TOPOLOGY_TARGETS_PRODUCTION=(
  vercel-production
  railway-production
  supabase-production
)

TOPOLOGY_TARGETS_ALL=(
  "${TOPOLOGY_TARGETS_STAGING[@]}"
  "${TOPOLOGY_TARGETS_PRODUCTION[@]}"
)

topology_logical_env_for_target() {
  case "$1" in
    *-staging) print -r -- "staging" ;;
    *-production|supabase) print -r -- "production" ;;
    github) print -r -- "staging" ;;
    *) return 1 ;;
  esac
}

topology_vercel_env_scope_for_target() {
  case "$1" in
    vercel-staging|vercel-production)
      print -r -- "$TOPOLOGY_VERCEL_ENV_SCOPE"
      ;;
    *)
      return 1
      ;;
  esac
}

topology_railway_environment_name_for_target() {
  case "$1" in
    railway-staging|railway-production)
      print -r -- "$TOPOLOGY_RAILWAY_ENVIRONMENT_NAME"
      ;;
    *)
      return 1
      ;;
  esac
}

topology_is_known_target() {
  local target="$1"
  local known=""
  [[ "$target" == "all" ]] && return 0
  for known in "${TOPOLOGY_TARGETS_ALL[@]}"; do
    [[ "$target" == "$known" ]] && return 0
  done
  [[ "$target" == "supabase" || "$target" == "google-oauth" ]] && return 0
  return 1
}
