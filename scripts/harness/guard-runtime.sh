#!/bin/bash
# Career Compass harness — runtime-aware block↔advisory primitive (SSOT).
#
# Single source for the Claude(risk-tiered)↔Codex(autonomy-budget) behaviour
# delta. Thin .claude/.codex guard wrappers source this, detect their
# condition, then call `gr_enforce <severity> <message>`; the severity +
# resolved runtime/context decide block vs advisory. Filenames, JSON `kind`
# and state-dir layout are intentionally NOT changed here (parallel-session
# safe): only the producing code is consolidated.
#
# Severity model (faithful to the approved risk-tier table; locked decision:
# Claude = risk-tiered two-way split, Codex = autonomy budget):
#   hard      exit 2 ALWAYS, both runtimes, never bypassable (the confirmed
#             dangerous/irreversible set, and deterministic correctness
#             invariants such as `git add && git commit`). HARNESS_DISABLE_
#             ADVISORY can NOT soften this.
#   high      Claude main agent  -> exit 2 (block; agent then AskUserQuestion).
#             Claude subagent/headless -> advisory exit 0 (cannot ask; return
#             control to the main agent).
#             Codex -> exit 2 (caller must have already tried any autonomy
#             soft-pass; Codex cannot AskUserQuestion).
#             HARNESS_DISABLE_ADVISORY=1 downgrades the Claude-main block to
#             advisory + log.
#   advisory  ALL runtimes/contexts -> non-blocking advisory, exit 0. The
#             caller still writes the same session-state flags so downstream
#             HARD/high gates stay coherent.
#
# Official-spec basis: Claude PreToolUse advisory = JSON stdout
#   {"hookSpecificOutput":{"hookEventName":"PreToolUse",
#     "permissionDecision":"allow","permissionDecisionReason":"...",
#     "additionalContext":"..."}} + exit 0  (never mix exit 2 with JSON).
# Codex PreToolUse also supports `additionalContext`; the human note is
# mirrored to stderr (developer-context path for both runtimes).

if [ -n "${__CAREER_COMPASS_GUARD_RUNTIME_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__CAREER_COMPASS_GUARD_RUNTIME_SOURCED=1

# --- runtime / context resolution -------------------------------------------

# gr_project_dir: best-effort project root (CLAUDE_PROJECT_DIR > git > pwd).
gr_project_dir() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"
    return 0
  fi
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  printf '%s\n' "${root:-$PWD}"
}

# gr_runtime [explicit]: echo "claude" | "codex".
# Order: explicit arg > $CAREER_COMPASS_RUNTIME > infer from caller path.
gr_runtime() {
  local explicit="${1:-}"
  if [ -n "$explicit" ]; then
    printf '%s\n' "$explicit"
    return 0
  fi
  if [ -n "${CAREER_COMPASS_RUNTIME:-}" ]; then
    printf '%s\n' "$CAREER_COMPASS_RUNTIME"
    return 0
  fi
  local src="${BASH_SOURCE[2]:-${BASH_SOURCE[1]:-$0}}"
  case "$src" in
    */.codex/*) printf 'codex\n' ;;
    *) printf 'claude\n' ;;
  esac
}

# gr_state_dir <runtime>: reuse guard-core's resolver (single source).
gr_state_dir() {
  local runtime="${1:-claude}"
  if ! command -v guard_state_dir_for_runtime >/dev/null 2>&1; then
    local gc
    gc="$(gr_project_dir)/scripts/harness/guard-core.sh"
    # shellcheck source=/dev/null
    [ -f "$gc" ] && . "$gc"
  fi
  if command -v guard_state_dir_for_runtime >/dev/null 2>&1; then
    guard_state_dir_for_runtime "$runtime"
    return 0
  fi
  # Fallback identical to guard-core's layout (must stay byte-compatible).
  case "$runtime" in
    codex) mkdir -p "$HOME/.codex/sessions/career_compass"; printf '%s\n' "$HOME/.codex/sessions/career_compass" ;;
    *) mkdir -p "$HOME/.claude/sessions/career_compass"; printf '%s\n' "$HOME/.claude/sessions/career_compass" ;;
  esac
}

# gr_is_subagent <input_json> [runtime]: deterministic detection ONLY.
# A subagent's transcript_path is always <project>/<session>/subagents/
# agent-<id>.jsonl; the main agent's is <project>/<session>.jsonl. We
# deliberately do NOT use a session-scoped marker fallback: subagents
# share the parent session_id, so any session-scoped marker would mislabel
# the MAIN agent as a subagent for the rest of the session (blocking-review
# finding H1 — it silently bypassed stop-plaintext-confirm-guard for the
# main agent). The transcript_path check is reliable and side-effect-free.
gr_is_subagent() {
  local input="${1:-}"
  local tp
  tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
  case "$tp" in
    */subagents/agent-*) return 0 ;;
  esac
  return 1
}

# gr_is_headless: no interactive AskUserQuestion possible.
gr_is_headless() {
  [ "${CLAUDE_CODE_HEADLESS:-}" = "1" ] || [ -n "${CLAUDE_NONINTERACTIVE:-}" ]
}

# gr_rel_path <project_dir> <path>: project-relative, normalized (no leading
# ./ or /). Replaces guards reaching into codex-hook-utils for rel paths.
gr_rel_path() {
  local project_dir="${1:-}"
  local path="${2:-}"
  [ -z "$path" ] && return 0
  case "$path" in
    "$project_dir"/*) printf '%s\n' "${path#"$project_dir"/}" ;;
    /*) printf '%s\n' "$path" ;;
    ./*) printf '%s\n' "${path#./}" ;;
    *) printf '%s\n' "$path" ;;
  esac
}

# --- observability (HARNESS_DEBUG) ------------------------------------------
# Zero overhead unless HARNESS_DEBUG is set. Never logs raw commands/secrets;
# detail is the caller-supplied reason token only.
gr_log() {
  [ -z "${HARNESS_DEBUG:-}" ] && return 0
  local hook="${1:-?}" decision="${2:-?}" reason="${3:-}"
  local log_path
  if [ "${HARNESS_DEBUG}" = "1" ]; then
    log_path="${HARNESS_DEBUG_LOG:-$HOME/.cache/career_compass/harness-debug.log}"
  else
    log_path="${HARNESS_DEBUG}"
  fi
  mkdir -p "$(dirname "$log_path")" 2>/dev/null || return 0
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || printf 'unknown')
  jq -cn \
    --arg ts "$ts" --arg rt "${GR_RUNTIME:-?}" --arg hook "$hook" \
    --arg decision "$decision" --arg reason "$reason" \
    --arg sid "${GR_SESSION_ID:-}" \
    '{ts:$ts,runtime:$rt,hook:$hook,decision:$decision,reason:$reason,sessionId:$sid}' \
    >> "$log_path" 2>/dev/null || true
}

# --- taxonomy SSOT (per-session cached) -------------------------------------
gr_taxonomy_cache_file() {
  printf '%s/.taxonomy-cache.json\n' "$(gr_state_dir "${GR_RUNTIME:-claude}")"
}

# gr_taxonomy_json: emit the frozen taxonomy, cached per session vs classifier mtime.
gr_taxonomy_json() {
  local project_dir cache classifier
  project_dir="$(gr_project_dir)"
  classifier="$project_dir/scripts/harness/command-classifier.mjs"
  cache="$(gr_taxonomy_cache_file)"
  if [ -f "$cache" ] && [ -f "$classifier" ] && [ "$cache" -nt "$classifier" ]; then
    cat "$cache"
    return 0
  fi
  local out
  out=$(node "$classifier" taxonomy 2>/dev/null || true)
  if [ -n "$out" ]; then
    printf '%s' "$out" > "$cache" 2>/dev/null || true
    printf '%s' "$out"
    return 0
  fi
  [ -f "$cache" ] && cat "$cache"
}

gr_action_in_taxonomy() {
  local action="${1:-}"
  [ -z "$action" ] && return 1
  gr_taxonomy_json | jq -e --arg a "$action" '(.actions // []) | index($a) != null' >/dev/null 2>&1
}

# --- advisory emission (PreToolUse) -----------------------------------------
# gr_advise <message>: structured non-blocking allow + injected context.
gr_advise() {
  local msg="${1:-advisory}"
  jq -n --arg ctx "$msg" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "advisory (non-blocking)",
      additionalContext: $ctx
    }
  }'
  printf '%s\n' "$msg" >&2
  exit 0
}

# --- core block↔advisory primitive ------------------------------------------
# gr_init <input_json> [explicit_runtime]: set GR_* context once per process.
gr_init() {
  GR_INPUT="${1:-}"
  GR_RUNTIME="$(gr_runtime "${2:-}")"
  GR_SESSION_ID="$(printf '%s' "$GR_INPUT" | jq -r '.session_id // empty' 2>/dev/null || true)"
  if gr_is_subagent "$GR_INPUT" "$GR_RUNTIME"; then GR_IS_SUBAGENT=1; else GR_IS_SUBAGENT=0; fi
  if gr_is_headless; then GR_IS_HEADLESS=1; else GR_IS_HEADLESS=0; fi
  export GR_INPUT GR_RUNTIME GR_SESSION_ID GR_IS_SUBAGENT GR_IS_HEADLESS
}

# gr_block <message>: hard stderr block, exit 2.
gr_block() {
  printf '%s\n' "${1:-blocked}" >&2
  exit 2
}

# gr_enforce <hard|high|advisory> <message>: the single decision point.
# Requires gr_init to have run (GR_RUNTIME/GR_IS_SUBAGENT/GR_IS_HEADLESS set).
gr_enforce() {
  local severity="${1:-advisory}"
  local message="${2:-}"
  local hook="${GR_HOOK:-guard}"
  case "$severity" in
    hard)
      gr_log "$hook" "hard-block" "$message"
      gr_block "$message"
      ;;
    high)
      if [ "${GR_RUNTIME}" = "claude" ] && [ "${GR_IS_SUBAGENT:-0}" != "1" ] && [ "${GR_IS_HEADLESS:-0}" != "1" ]; then
        if [ "${HARNESS_DISABLE_ADVISORY:-}" = "1" ]; then
          gr_log "$hook" "high-killswitch-advisory" "$message"
          gr_advise "$message"
        fi
        gr_log "$hook" "high-block" "$message"
        gr_block "$message"
      fi
      if [ "${GR_RUNTIME}" = "codex" ]; then
        gr_log "$hook" "high-block-codex" "$message"
        gr_block "$message"
      fi
      # Claude subagent / headless: cannot AskUserQuestion -> advisory.
      gr_log "$hook" "high-advisory-subagent" "$message"
      gr_advise "$message"
      ;;
    advisory|soft|*)
      gr_log "$hook" "advisory" "$message"
      gr_advise "$message"
      ;;
  esac
}
