#!/bin/bash
# Career Compass harness — READ-ONLY session-state inspector.
#
# Groups the session-state flag files under the Claude and/or Codex state
# dirs by flag family (the stable prefix before the trailing `-<sessionId>`),
# prints a per-family count and, for each file, its session id + mtime. For
# `*.json` checkpoint files it additionally runs
# `scripts/harness/diff-snapshot.mjs verify` and prints OK|STALE|INVALID,
# plus EXPIRED when `.expiresAt` is in the past.
#
# This script NEVER mutates state: it only reads + prints. Safe to run while
# other sessions are live (parallel-session safe).
#
# Usage:
#   scripts/debug/inspect-session-state.sh [--runtime claude|codex|both] \
#                                          [--session <id>]
# Defaults: --runtime both, all sessions.

set -uo pipefail

RUNTIME_SEL="both"
SESSION_SEL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --runtime)
      RUNTIME_SEL="${2:-both}"
      shift 2 || shift
      ;;
    --runtime=*)
      RUNTIME_SEL="${1#--runtime=}"
      shift
      ;;
    --session)
      SESSION_SEL="${2:-}"
      shift 2 || shift
      ;;
    --session=*)
      SESSION_SEL="${1#--session=}"
      shift
      ;;
    -h|--help)
      grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'inspect-session-state: unknown arg: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

case "$RUNTIME_SEL" in
  claude|codex|both) ;;
  *)
    printf 'inspect-session-state: --runtime must be claude|codex|both (got %s)\n' "$RUNTIME_SEL" >&2
    exit 1
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PWD")"
DIFF_SNAPSHOT="$REPO_ROOT/scripts/harness/diff-snapshot.mjs"

# state_dir_for <claude|codex>: byte-compatible with guard-core's layout.
# Read-only on purpose: we do NOT mkdir here (inspection must not create dirs).
state_dir_for() {
  case "$1" in
    codex) printf '%s\n' "$HOME/.codex/sessions/career_compass" ;;
    *) printf '%s\n' "$HOME/.claude/sessions/career_compass" ;;
  esac
}

now_epoch() {
  date -u +%s 2>/dev/null || printf '0'
}

file_mtime() {
  # BSD stat: human-readable mtime.
  stat -f '%Sm' -t '%Y-%m-%dT%H:%M:%SZ' "$1" 2>/dev/null \
    || stat -f '%Sm' "$1" 2>/dev/null \
    || printf 'unknown'
}

# Known flag-family prefixes (SSOT). A file belongs to the longest prefix
# from this list that it starts with; the remainder (after the trailing `-`)
# is the session id / headsha / advisory descriptor. Listed longest-first so
# the longest-prefix match wins (e.g. `*-advisory` before its base name).
# Documented families plus other long-lived families observed in the live
# state dirs. Longest-prefix wins, so e.g. `codex-plan-review-approved`
# resolves before `codex-plan-review`.
KNOWN_FAMILIES="
production-promotion-approved
prompt-quality-verification
codex-delegation-checkpoint
codex-plan-review-approved
codex-plan-review-decision
codex-commit-delegation
codex-plan-checkpoint
prompt-review-confirmed
prompt-review-pending
autonomy-manifest
autonomy-intent
migration-approved
release-approved
staging-verified
bandaid-approved
test-categories
subagent-active
e2e-functional
e2e-confirm
e2e-options
qg-edit-counter
qg-hinted-correctness
qg-hinted-maintainability
qg-hinted-security
qg-hinted-aiLlm
qg-hints-emitted
push-approved
plan-exited
tdd-session
tdd-edits
edited-fastapi
edited-next-api
edit-count
cross-notified
ui-reminded
"

# family_of <basename> <sessionId>: recover the stable flag family.
#   1) longest known-family prefix match (SSOT)
#   2) if --session is pinned, strip a trailing -<sid>
#   3) fallback: strip a trailing UUID-shaped id, then a long hex (headsha),
#      then a short hex/alnum id token
# `*-advisory-<sid>.json` and `qg-*-<sid>` fall through to the fallback,
# which still yields a stable family (e.g. `qg-foo`, `bar-advisory`).
family_of() {
  local base="$1" sid="$2" fam="$1"
  fam="${fam%.json}"

  local kf
  for kf in $KNOWN_FAMILIES; do
    case "$fam" in
      "$kf"|"$kf"-*) printf '%s\n' "$kf"; return 0 ;;
    esac
  done

  if [ -n "$sid" ]; then
    case "$fam" in
      *-"$sid") printf '%s\n' "${fam%-"$sid"}"; return 0 ;;
    esac
  fi

  # UUID-shaped suffix: 8-4-4-4-12 hex (Claude/Codex session ids).
  case "$fam" in
    *-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f])
      printf '%s\n' "${fam%-*-*-*-*-*}"
      return 0
      ;;
  esac

  # Truncated UUID suffix: 8-4-4-4 hex (some producers store a clipped id).
  case "$fam" in
    *-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f]-[0-9a-f][0-9a-f][0-9a-f][0-9a-f])
      printf '%s\n' "${fam%-*-*-*-*}"
      return 0
      ;;
  esac

  # Long hex (>=8) trailing token: headsha-style.
  case "$fam" in
    *-*)
      local last="${fam##*-}"
      case "$last" in
        [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*)
          printf '%s\n' "${fam%-"$last"}"
          return 0
          ;;
      esac
      ;;
  esac

  printf '%s\n' "$fam"
}

# session_of <basename> <family>: the trailing id segment after the family
# prefix (sans .json). Used only for display when --session is not pinned.
session_of() {
  local base="$1" fam="$2"
  base="${base%.json}"
  case "$base" in
    "$fam"-*) printf '%s\n' "${base#"$fam"-}" ;;
    "$fam") printf '%s\n' "-" ;;
    *-*) printf '%s\n' "${base##*-}" ;;
    *) printf '%s\n' "-" ;;
  esac
}

verify_json_checkpoint() {
  # echoes one of: OK | STALE | INVALID  (+ optional " EXPIRED")
  local f="$1" verdict status expired=""
  local exp_at
  if command -v jq >/dev/null 2>&1; then
    exp_at="$(jq -r '.expiresAt // empty' "$f" 2>/dev/null || true)"
    if [ -n "$exp_at" ]; then
      local exp_epoch now
      exp_epoch="$(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$exp_at" +%s 2>/dev/null || printf '')"
      now="$(now_epoch)"
      if [ -n "$exp_epoch" ] && [ "$exp_epoch" -lt "$now" ] 2>/dev/null; then
        expired=" EXPIRED"
      fi
    fi
  fi
  if [ -f "$DIFF_SNAPSHOT" ] && command -v node >/dev/null 2>&1; then
    if node "$DIFF_SNAPSHOT" verify --project "$REPO_ROOT" --file "$f" >/dev/null 2>&1; then
      verdict="OK"
    else
      status=$?
      # JSON-parse failure path inside diff-snapshot is also exit 2; we
      # distinguish INVALID (not parseable here) vs STALE (parseable JSON
      # but snapshot/expiry mismatch).
      if command -v jq >/dev/null 2>&1 && ! jq -e . "$f" >/dev/null 2>&1; then
        verdict="INVALID"
      else
        verdict="STALE"
      fi
    fi
  else
    verdict="INVALID"
  fi
  printf '%s%s\n' "$verdict" "$expired"
}

inspect_runtime() {
  local runtime="$1"
  local dir
  dir="$(state_dir_for "$runtime")"

  printf '================================================================\n'
  printf ' Runtime: %s\n' "$runtime"
  printf ' State dir: %s\n' "$dir"
  printf '================================================================\n'

  if [ ! -d "$dir" ]; then
    printf '  (state dir does not exist — no sessions for this runtime)\n\n'
    return 0
  fi

  # Collect candidate files (regular files only), apply --session filter.
  local tmp_list
  tmp_list="$(mktemp 2>/dev/null || printf '/tmp/inspect-session-state.%s' "$$")"
  : > "$tmp_list"

  local f base sid fam
  for f in "$dir"/* "$dir"/.[!.]*; do
    [ -e "$f" ] || continue
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    if [ -n "$SESSION_SEL" ]; then
      case "$base" in
        *"$SESSION_SEL"*) ;;
        *) continue ;;
      esac
    fi
    fam="$(family_of "$base" "$SESSION_SEL")"
    sid="$(session_of "$base" "$fam")"
    printf '%s\t%s\t%s\t%s\n' "$fam" "$base" "$sid" "$f" >> "$tmp_list"
  done

  if [ ! -s "$tmp_list" ]; then
    if [ -n "$SESSION_SEL" ]; then
      printf '  (no flag files for session "%s")\n\n' "$SESSION_SEL"
    else
      printf '  (no flag files present)\n\n'
    fi
    rm -f "$tmp_list" 2>/dev/null || true
    return 0
  fi

  # Iterate families in sorted order. tmp_list cols: fam \t base \t sid \t path
  local fam_prev="" first=1
  while IFS=$'\t' read -r fam base sid path; do
    if [ "$fam" != "$fam_prev" ]; then
      [ "$first" -eq 0 ] && printf '\n'
      first=0
      local cnt
      cnt="$(cut -f1 "$tmp_list" | grep -cxF "$fam" 2>/dev/null || printf '0')"
      printf '  [family] %s  (count: %s)\n' "$fam" "$cnt"
      fam_prev="$fam"
    fi
    local mtime
    mtime="$(file_mtime "$path")"
    case "$base" in
      *.json)
        local verdict
        verdict="$(verify_json_checkpoint "$path")"
        printf '    - %s\n        session=%s  mtime=%s  checkpoint=%s\n' \
          "$base" "$sid" "$mtime" "$verdict"
        ;;
      *)
        printf '    - %s\n        session=%s  mtime=%s\n' \
          "$base" "$sid" "$mtime"
        ;;
    esac
  done < <(sort -t "$(printf '\t')" -k1,1 -k2,2 "$tmp_list")

  printf '\n'
  rm -f "$tmp_list" 2>/dev/null || true
}

printf 'Career Compass — session-state inspection (READ-ONLY)\n'
printf 'Repo: %s\n' "$REPO_ROOT"
if [ -n "$SESSION_SEL" ]; then
  printf 'Filter: session=%s\n' "$SESSION_SEL"
fi
printf '\n'

case "$RUNTIME_SEL" in
  claude) inspect_runtime claude ;;
  codex)  inspect_runtime codex ;;
  both)
    inspect_runtime claude
    inspect_runtime codex
    ;;
esac

exit 0
