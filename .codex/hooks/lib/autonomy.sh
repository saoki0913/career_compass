#!/bin/bash
# Codex-only autonomous checkpoint helpers. These helpers never approve
# hard-deny operations; callers must run force-push, secret, and delete guards first.

if [ -n "${__CODEX_AUTONOMY_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__CODEX_AUTONOMY_SOURCED=1

# --- Artifact JSON schemas (single source of truth: command-classifier.mjs
#     `taxonomy` subcommand owns the action / releaseMode vocabularies) -------
#
# autonomy-intent-<sid>.json   (written by user-prompt-submit-router.sh)
#   { schemaVersion:1, kind:"codex-autonomy-intent", decision:"approved",
#     issuer:"codex-user-prompt-router", createdAt:<UTC ISO8601>,
#     expiresAt:<UTC ISO8601>, promptHash:<sha256>,
#     actions:[<subset of taxonomy.actions | "all">],
#     releaseModes:[<subset of taxonomy.releaseModes | "all">] }
#   Consumed only by codex_autonomy_has_intent (validates kind/decision/
#   issuer, action+releaseMode membership, and that expiresAt is in the
#   future — the budget GRANT, which must expire faster than the manifest).
#
# autonomy-manifest-<sid>.json (written by diff-snapshot.mjs checkpoint via
#   codex_autonomy_create_manifest)
#   { schemaVersion:1, kind:"codex-autonomy", decision:"approved",
#     issuer:"codex-autonomy", releaseMode, actions[], categories{},
#     commandHash, remote, refspec, headSha, stagedDiffHash,
#     createdAt, expiresAt (TTL 86400s) }
#   The command BINDING; consumed by codex_autonomy_action_allowed /
#   _release_mode_matches / _command_matches.

# codex_autonomy_action_in_taxonomy <project_dir> <action>
# Defensive gate: reject an action that is not in the frozen taxonomy
# (typo / future drift) instead of silently failing a later check. Fails
# OPEN if the classifier is unavailable (a transient infra error must not
# disable autonomy nor weaken the real intent/manifest/safety gates below).
codex_autonomy_action_in_taxonomy() {
  local project_dir="$1"
  local action="$2"
  [ -z "$action" ] && return 1
  local taxonomy
  taxonomy=$(node "$project_dir/scripts/harness/command-classifier.mjs" taxonomy 2>/dev/null || true)
  [ -z "$taxonomy" ] && return 0
  printf '%s' "$taxonomy" | jq -e --arg a "$action" '(.actions // []) | index($a) != null' >/dev/null 2>&1
}

codex_autonomy_intent_file() {
  local state_dir="$1"
  local session_id="$2"
  printf '%s/autonomy-intent-%s.json\n' "$state_dir" "$session_id"
}

codex_autonomy_manifest_file() {
  local state_dir="$1"
  local session_id="$2"
  printf '%s/autonomy-manifest-%s.json\n' "$state_dir" "$session_id"
}

codex_autonomy_has_intent() {
  local state_dir="$1"
  local session_id="$2"
  local action="${3:-}"
  local release_mode="${4:-}"
  local intent_file
  intent_file=$(codex_autonomy_intent_file "$state_dir" "$session_id")
  [ -f "$intent_file" ] || return 1

  jq -e --arg action "$action" --arg release_mode "$release_mode" '
    .kind == "codex-autonomy-intent"
    and .decision == "approved"
    and .issuer == "codex-user-prompt-router"
    and ((.actions // []) | (index($action) != null or index("all") != null))
    and (
      $release_mode == ""
      or ((.releaseModes // []) | (index($release_mode) != null or index("all") != null))
    )
    and (
      (.expiresAt // "") == ""
      or ((.expiresAt | fromdateiso8601) > now)
    )
  ' "$intent_file" >/dev/null 2>&1
}

codex_autonomy_action_allowed() {
  local manifest_file="$1"
  local action="$2"
  jq -e --arg action "$action" '
    .kind == "codex-autonomy"
    and .decision == "approved"
    and ((.issuer // "codex-autonomy") == "codex-autonomy")
    and ((.actions // []) | index($action) != null)
  ' "$manifest_file" >/dev/null 2>&1
}

codex_autonomy_release_mode_matches() {
  local manifest_file="$1"
  local release_mode="$2"
  if [ -z "$release_mode" ]; then
    return 0
  fi
  local approved_mode
  approved_mode=$(jq -r '.releaseMode // empty' "$manifest_file" 2>/dev/null || echo "")
  [ -z "$approved_mode" ] || [ "$approved_mode" = "$release_mode" ] || [ "$approved_mode" = "release" ]
}

codex_autonomy_command_matches() {
  local project_dir="$1"
  local manifest_file="$2"
  local command="$3"
  local require_hash="${4:-0}"
  if [ -z "$(jq -r '.commandHash // empty' "$manifest_file" 2>/dev/null || echo "")" ]; then
    [ "$require_hash" = "1" ] && return 1
    node "$project_dir/scripts/harness/diff-snapshot.mjs" verify --project "$project_dir" --file "$manifest_file" >/dev/null
    return $?
  fi
  node "$project_dir/scripts/harness/diff-snapshot.mjs" verify --project "$project_dir" --file "$manifest_file" --command "$command" >/dev/null
}

codex_autonomy_classifier_predicate() {
  local project_dir="$1"
  local command="$2"
  local predicate="$3"
  node "$project_dir/scripts/harness/command-classifier.mjs" "$command" "$predicate" >/dev/null 2>&1
}

codex_autonomy_git_push_remote() {
  local project_dir="$1"
  local command="$2"
  node "$project_dir/scripts/harness/command-classifier.mjs" "$command" | jq -r '.gitPushRemote // empty' 2>/dev/null || true
}

codex_autonomy_git_push_refspec() {
  local project_dir="$1"
  local command="$2"
  node "$project_dir/scripts/harness/command-classifier.mjs" "$command" | jq -r '.gitPushRefspecs[0] // empty' 2>/dev/null || true
}

codex_autonomy_is_safe_push() {
  local project_dir="$1"
  local command="$2"
  codex_autonomy_classifier_predicate "$project_dir" "$command" "gitPushAllowedTarget"
}

codex_autonomy_is_safe_release() {
  local project_dir="$1"
  local command="$2"
  local release_mode="$3"
  case "$release_mode" in
    provider)
      return 1
      ;;
  esac
  printf '%s' "$command" | grep -Eq -- '(^|[[:space:]])--skip-(staging|health|playwright|tests)' && return 1
  local segment_count
  segment_count=$(node "$project_dir/scripts/harness/command-classifier.mjs" "$command" | jq -r '(.segments // []) | length' 2>/dev/null || echo 0)
  [ "$segment_count" = "1" ] || return 1

  local segment
  segment=$(node "$project_dir/scripts/harness/command-classifier.mjs" "$command" | jq -r '.segments[0] // empty' 2>/dev/null || echo "")
  printf '%s' "$segment" | grep -Eq '^(make[[:space:]][^;&|]*(deploy-staging|deploy-production)[^;&|]*|zsh[[:space:]]+scripts/release/release-career-compass\.sh[[:space:]].*(--staging-only|--production)([^;&|]*)?|bash[[:space:]]+scripts/release/release-career-compass\.sh[[:space:]].*(--staging-only|--production)([^;&|]*)?|zsh[[:space:]]+scripts/release/deploy-production\.sh([^;&|]*)?|bash[[:space:]]+scripts/release/deploy-production\.sh([^;&|]*)?)$'
}

# NOTE: codex_autonomy_can_create was a byte-identical duplicate of
# codex_autonomy_action_is_safe (only the parameter order differed). It was
# removed; codex_autonomy_allows_action now calls codex_autonomy_action_is_safe
# for both the fast-path check and the create-decision (single predicate).
codex_autonomy_action_is_safe() {
  local project_dir="$1"
  local state_dir="$2"
  local session_id="$3"
  local action="$4"
  local command="$5"
  local release_mode="${6:-}"

  case "$action" in
    test)
      return 0
      ;;
    push)
      codex_autonomy_has_intent "$state_dir" "$session_id" "$action" "$release_mode" || return 1
      codex_autonomy_is_safe_push "$project_dir" "$command"
      ;;
    release)
      codex_autonomy_has_intent "$state_dir" "$session_id" "$action" "$release_mode" || return 1
      codex_autonomy_is_safe_release "$project_dir" "$command" "$release_mode"
      ;;
    production-promotion)
      codex_autonomy_has_intent "$state_dir" "$session_id" "$action" "production" || return 1
      codex_autonomy_is_safe_release "$project_dir" "$command" "production"
      ;;
    *)
      return 1
      ;;
  esac
}

codex_autonomy_create_manifest() {
  local project_dir="$1"
  local manifest_file="$2"
  local action="$3"
  local command="$4"
  local release_mode="${5:-}"
  local categories="e2e-functional=run:all,quality=run:all,static=run,security=run"
  local actions="$action"
  local command_option=()
  local remote_option=()
  local refspec_option=()

  case "$action" in
    test)
      command_option=()
      actions="test"
      ;;
    production-promotion)
      command_option=(--command "$command")
      actions="production-promotion,release"
      ;;
    push|release)
      command_option=(--command "$command")
      ;;
  esac

  if [ "$action" = "push" ]; then
    remote_option=(--remote "$(codex_autonomy_git_push_remote "$project_dir" "$command")")
    refspec_option=(--refspec "$(codex_autonomy_git_push_refspec "$project_dir" "$command")")
  fi

  mkdir -p "$(dirname "$manifest_file")"
  node "$project_dir/scripts/harness/diff-snapshot.mjs" checkpoint \
    --kind codex-autonomy \
    --decision approved \
    --issuer codex-autonomy \
    --project "$project_dir" \
    --release-mode "$release_mode" \
    --actions "$actions" \
    --categories "$categories" \
    "${command_option[@]+"${command_option[@]}"}" \
    "${remote_option[@]+"${remote_option[@]}"}" \
    "${refspec_option[@]+"${refspec_option[@]}"}" \
    --ttl-seconds 86400 \
    > "$manifest_file"
}

codex_autonomy_allows_action() {
  local project_dir="$1"
  local state_dir="$2"
  local session_id="$3"
  local action="$4"
  local command="$5"
  local release_mode="${6:-}"

  if [ -z "$session_id" ]; then
    return 1
  fi

  # Defensive: an action outside the frozen taxonomy is a typo / future
  # drift — fail closed here rather than silently failing a later check.
  codex_autonomy_action_in_taxonomy "$project_dir" "$action" || return 1

  local manifest_file
  manifest_file=$(codex_autonomy_manifest_file "$state_dir" "$session_id")
  if [ -f "$manifest_file" ] \
    && codex_autonomy_action_allowed "$manifest_file" "$action" \
    && codex_autonomy_release_mode_matches "$manifest_file" "$release_mode" \
    && codex_autonomy_action_is_safe "$project_dir" "$state_dir" "$session_id" "$action" "$command" "$release_mode" \
    && codex_autonomy_command_matches "$project_dir" "$manifest_file" "$command" "$([ "$action" = "test" ] && printf 0 || printf 1)"; then
    return 0
  fi

  if codex_autonomy_action_is_safe "$project_dir" "$state_dir" "$session_id" "$action" "$command" "$release_mode"; then
    codex_autonomy_create_manifest "$project_dir" "$manifest_file" "$action" "$command" "$release_mode" || return 1
  fi

  [ -f "$manifest_file" ] || return 1
  codex_autonomy_action_allowed "$manifest_file" "$action" || return 1
  codex_autonomy_release_mode_matches "$manifest_file" "$release_mode" || return 1
  codex_autonomy_action_is_safe "$project_dir" "$state_dir" "$session_id" "$action" "$command" "$release_mode" || return 1
  codex_autonomy_command_matches "$project_dir" "$manifest_file" "$command" "$([ "$action" = "test" ] && printf 0 || printf 1)" || return 1
}
