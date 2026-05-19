#!/bin/bash
# Career Compass harness — READ-ONLY harness-debug.log pretty-printer.
#
# Pretty-prints the JSONL harness debug log emitted by gr_log() in
# scripts/harness/guard-runtime.sh as aligned columns:
#
#   ts | runtime | hook | decision | reason | sid
#
# Each log line schema: {ts,runtime,hook,decision,reason,sessionId}.
#
# READ-ONLY: only reads + prints the log; never writes or rotates it.
#
# Usage:
#   scripts/debug/tail-harness-log.sh [-f] [-n N] [--path <file>]
#     -f          follow mode (tail -f, live)
#     -n N        show last N lines (default 50; ignored with -f)
#     --path FILE override log path
#
# Default log path:
#   ${HARNESS_DEBUG_LOG:-$HOME/.cache/career_compass/harness-debug.log}

set -uo pipefail

FOLLOW=0
LINES=50
LOG_PATH="${HARNESS_DEBUG_LOG:-$HOME/.cache/career_compass/harness-debug.log}"

while [ $# -gt 0 ]; do
  case "$1" in
    -f|--follow)
      FOLLOW=1
      shift
      ;;
    -n)
      LINES="${2:-50}"
      shift 2 || shift
      ;;
    -n*)
      LINES="${1#-n}"
      shift
      ;;
    --path)
      LOG_PATH="${2:-$LOG_PATH}"
      shift 2 || shift
      ;;
    --path=*)
      LOG_PATH="${1#--path=}"
      shift
      ;;
    -h|--help)
      grep '^#' "$0" | grep -v '^#!' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'tail-harness-log: unknown arg: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

case "$LINES" in
  ''|*[!0-9]*)
    printf 'tail-harness-log: -n expects an integer (got %s)\n' "$LINES" >&2
    exit 1
    ;;
esac

if ! command -v jq >/dev/null 2>&1; then
  printf 'tail-harness-log: jq is required but not found on PATH.\n' >&2
  exit 1
fi

if [ ! -f "$LOG_PATH" ]; then
  printf 'tail-harness-log: no harness-debug.log yet at:\n  %s\n' "$LOG_PATH" >&2
  printf 'Enable logging with HARNESS_DEBUG=1 (default path) or\n' >&2
  printf 'HARNESS_DEBUG=<path> to choose a custom log file.\n' >&2
  exit 0
fi

# jq program: render one aligned row per JSON line. Tolerates malformed
# lines (jq -R fromjson? skips non-JSON). Column widths chosen for the
# known token vocabulary; reason is left free-form (last column).
JQ_ROW='
  fromjson?
  | [
      ((.ts // "-")        | tostring),
      ((.runtime // "-")   | tostring),
      ((.hook // "-")      | tostring),
      ((.decision // "-")  | tostring),
      ((.reason // "-")    | tostring),
      ((.sessionId // "-") | tostring)
    ]
  | "\(.[0] | .[0:20] ) | \(.[1] | (. + "      ")[0:6]) | \(.[2] | (. + "                          ")[0:26]) | \(.[3] | (. + "                         ")[0:25]) | \(.[5] | (. + "                                    ")[0:36]) | \(.[4])"
'

print_header() {
  printf '%-20s | %-6s | %-26s | %-25s | %-36s | %s\n' \
    "ts" "rt" "hook" "decision" "sid" "reason"
  printf '%s\n' \
    "---------------------+--------+----------------------------+---------------------------+--------------------------------------+--------------------------------"
}

if [ "$FOLLOW" -eq 1 ]; then
  print_header
  # Show a small tail first, then follow. jq --unbuffered so rows stream.
  tail -n "${LINES}" -f "$LOG_PATH" | jq -R --unbuffered -r "$JQ_ROW"
  exit 0
fi

LINE_COUNT="$(wc -l < "$LOG_PATH" 2>/dev/null | tr -d ' ')"
if [ -z "$LINE_COUNT" ] || [ "$LINE_COUNT" -eq 0 ]; then
  printf 'tail-harness-log: log file is empty: %s\n' "$LOG_PATH" >&2
  printf '(harness has not logged any decisions yet)\n' >&2
  exit 0
fi

print_header
tail -n "$LINES" "$LOG_PATH" | jq -R -r "$JQ_ROW"

exit 0
