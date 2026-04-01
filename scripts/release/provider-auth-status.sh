#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
source "${script_dir}/common.sh"

strict=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)
      strict=1
      ;;
    -h|--help)
      echo "Usage: $0 [--strict]" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

failures=0

report() {
  local level="$1"
  local name="$2"
  local message="$3"
  printf '[auth][%s] %s: %s\n' "$level" "$name" "$message"
}

mark_failure() {
  failures=$((failures + 1))
}

first_nonempty_line() {
  local text="$1"
  local line
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then
      print -r -- "$line"
      return
    fi
  done <<< "$text"
}

contains_pattern() {
  local text="$1"
  local pattern="$2"
  print -r -- "$text" | rg -qi "$pattern"
}

check_command() {
  local name="$1"
  shift
  local output

  if ! output="$("$@" 2>&1)"; then
    report "NG" "$name" "$(first_nonempty_line "$output")"
    mark_failure
    return
  fi

  if contains_pattern "$output" "no existing credentials found|unauthorized|not logged in|not authenticated|please run .* login|failed to fetch"; then
    report "NG" "$name" "$(first_nonempty_line "$output")"
    mark_failure
    return
  fi

  report "OK" "$name" "$(first_nonempty_line "$output")"
}

check_command_passthrough() {
  local name="$1"
  shift

  if ! "$@"; then
    report "NG" "$name" "command failed"
    mark_failure
    return
  fi

  report "OK" "$name" "command succeeded"
}

echo "Provider auth status"
echo

check_command_passthrough "GitHub" run_real gh auth status
check_command "Vercel" run_real vercel whoami
check_command "Railway" run_real railway whoami
check_command "Supabase" run_real supabase projects list
check_command "Google Cloud" run_real gcloud auth list

adc_message="ADC is unavailable"
if run_real gcloud auth application-default print-access-token >/dev/null 2>&1; then
  adc_message="ADC is available"
  report "OK" "Google ADC" "$adc_message"
else
  report "NG" "Google ADC" "$adc_message"
  mark_failure
fi

if [[ "$strict" == "1" && "$failures" -gt 0 ]]; then
  exit 1
fi
