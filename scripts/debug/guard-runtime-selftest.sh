#!/bin/bash
# Career Compass harness — guard-runtime.sh invariant selftest (READ-ONLY).
#
# Sources scripts/harness/guard-runtime.sh and asserts the severity-model
# invariants. Because gr_enforce / gr_advise / gr_block call `exit`, each
# case is executed in an isolated subshell and we inspect its exit code.
#
# Critical safety invariant under test:
#   HARNESS_DISABLE_ADVISORY=1 CANNOT soften a `hard` enforcement.
#
# READ-ONLY: sources the library and runs assertions only. Touches nothing
# under the session-state dirs.
#
# Exit: 0 iff every case PASSES; non-zero otherwise.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PWD")"
cd "$REPO_ROOT" 2>/dev/null || {
  printf 'guard-runtime-selftest: cannot cd to repo root.\n' >&2
  exit 1
}

GUARD_RUNTIME="$REPO_ROOT/scripts/harness/guard-runtime.sh"
if [ ! -f "$GUARD_RUNTIME" ]; then
  printf 'guard-runtime-selftest: missing %s\n' "$GUARD_RUNTIME" >&2
  exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0

# Body executed by each isolated child process. Reads context from the
# environment (CASE_*) so the parent never has to interpolate into a -c
# string. gr_enforce/gr_advise/gr_block always call `exit`, so this child
# terminates with the runtime's decision code; `exit 99` only fires if the
# severity dispatcher unexpectedly fell through (also a failure).
CASE_BODY='
  set -uo pipefail
  . "$CASE_GUARD_RUNTIME"
  gr_init "$CASE_INPUT" "$CASE_RUNTIME"
  gr_enforce "$CASE_SEVERITY" "selftest:$CASE_NAME"
  exit 99
'

# run_case <name> <expected_rc> <runtime> <input_json> <severity> [env...]
# Spawns a clean child `bash` (separate process so the function-level
# `exit` becomes that child's exit status), sources guard-runtime fresh,
# runs gr_init + gr_enforce, and compares the resulting exit code. Extra
# args are VAR=value assignments scoped to that child only.
run_case() {
  local name="$1" expected="$2" runtime="$3" input="$4" severity="$5"
  shift 5
  local envassign="$*"

  local actual=0
  if env \
      $envassign \
      CASE_GUARD_RUNTIME="$GUARD_RUNTIME" \
      CASE_INPUT="$input" \
      CASE_RUNTIME="$runtime" \
      CASE_SEVERITY="$severity" \
      CASE_NAME="$name" \
      bash -c "$CASE_BODY" >/dev/null 2>&1; then
    actual=0
  else
    actual=$?
  fi

  if [ "$actual" = "$expected" ]; then
    printf 'PASS  %-58s (rc=%s)\n' "$name" "$actual"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    printf 'FAIL  %-58s (expected rc=%s, got rc=%s)\n' "$name" "$expected" "$actual"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# Input payloads.
MAIN_JSON='{"session_id":"selftest-main","transcript_path":"/tmp/career_compass/transcript.jsonl"}'
SUBAGENT_JSON='{"session_id":"selftest-sub","transcript_path":"/tmp/career_compass/subagents/agent-abc123.jsonl"}'

printf 'Career Compass — guard-runtime.sh invariant selftest\n'
printf 'Library: %s\n\n' "$GUARD_RUNTIME"

# --- hard: always blocks (exit 2), kill-switch CANNOT soften ----------------
run_case "hard / claude-main => exit 2" \
  2 claude "$MAIN_JSON" hard
run_case "hard / claude-main + HARNESS_DISABLE_ADVISORY=1 => exit 2 (SAFETY)" \
  2 claude "$MAIN_JSON" hard "HARNESS_DISABLE_ADVISORY=1"
run_case "hard / codex => exit 2" \
  2 codex "$MAIN_JSON" hard

# --- advisory: always non-blocking (exit 0) --------------------------------
run_case "advisory / claude-main => exit 0" \
  0 claude "$MAIN_JSON" advisory
run_case "advisory / codex => exit 0" \
  0 codex "$MAIN_JSON" advisory

# --- high: risk-tiered split ------------------------------------------------
run_case "high / claude-main (non-subagent) => exit 2 (block)" \
  2 claude "$MAIN_JSON" high
run_case "high / codex => exit 2 (block)" \
  2 codex "$MAIN_JSON" high
run_case "high / claude-subagent => exit 0 (advisory)" \
  0 claude "$SUBAGENT_JSON" high
run_case "high / claude-main + HARNESS_DISABLE_ADVISORY=1 => exit 0 (soften)" \
  0 claude "$MAIN_JSON" high "HARNESS_DISABLE_ADVISORY=1"

printf '\n----------------------------------------------------------------\n'
printf 'Summary: %s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -ne 0 ]; then
  printf 'RESULT: FAIL\n'
  exit 1
fi
printf 'RESULT: ALL PASS\n'
exit 0
