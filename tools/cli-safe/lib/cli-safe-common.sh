#!/usr/bin/env bash
set -euo pipefail

CLI_SAFE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_SAFE_ROOT="$(cd "$CLI_SAFE_LIB_DIR/.." && pwd)"
CLI_SAFE_BIN_DIR="$CLI_SAFE_ROOT/bin"
CLI_SAFE_REQUEST_ID="${CLI_SAFE_REQUEST_ID:-cli-$(date +%Y%m%d%H%M%S)-$$}"

cli_safe_log() {
  printf '[cli-safe][%s][%s] %s\n' "$CLI_SAFE_REQUEST_ID" "$1" "$2" >&2
}

cli_safe_die() {
  cli_safe_log "$1" "$2"
  exit 1
}

cli_safe_find_real_binary() {
  local target="$1"
  local cleaned=""
  local part
  IFS=':' read -r -a path_parts <<< "${PATH:-}"
  for part in "${path_parts[@]}"; do
    if [[ -z "$part" || "$part" == "$CLI_SAFE_BIN_DIR" ]]; then
      continue
    fi
    if [[ -n "$cleaned" ]]; then
      cleaned="${cleaned}:"
    fi
    cleaned="${cleaned}${part}"
  done
  PATH="$cleaned" command -v "$target" 2>/dev/null || true
}

cli_safe_has_arg() {
  local needle="$1"
  shift || true
  local value
  for value in "$@"; do
    if [[ "$value" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

cli_safe_any_arg_contains() {
  local needle="$1"
  shift || true
  local value
  for value in "$@"; do
    if [[ "$value" == *"$needle"* ]]; then
      return 0
    fi
  done
  return 1
}

cli_safe_assert_no_dangerous_flags() {
  local service="$1"
  shift || true
  local arg
  for arg in "$@"; do
    case "$arg" in
      --force|--force-with-lease|--hard|--delete|--destroy|--drop|--wipe|--prod|-d)
        cli_safe_die "$service" "危険なフラグ '$arg' は許可していません。"
        ;;
    esac
  done
}

cli_safe_run() {
  local service="$1"
  local real_name="$2"
  shift 2 || true
  local real_bin
  real_bin="$(cli_safe_find_real_binary "$real_name")"
  if [[ -z "$real_bin" ]]; then
    cli_safe_die "$service" "実バイナリ '$real_name' が見つかりません。CLI をインストールしてください。"
  fi
  cli_safe_log "$service" "exec: $real_name $*"
  exec "$real_bin" "$@"
}

cli_safe_assert_git_branch() {
  local expected="$1"
  local git_bin
  git_bin="$(cli_safe_find_real_binary git)"
  if [[ -z "$git_bin" ]]; then
    cli_safe_die "git" "実バイナリ 'git' が見つかりません。"
  fi
  local current
  current="$("$git_bin" branch --show-current 2>/dev/null || true)"
  if [[ "$current" != "$expected" ]]; then
    cli_safe_die "git" "この操作は $expected ブランチでのみ許可しています（現在: ${current:-unknown}）。"
  fi
}
