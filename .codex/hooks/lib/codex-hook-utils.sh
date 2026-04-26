#!/bin/bash
# Shared helpers for Codex lifecycle hooks.

if [ -n "${__CODEX_HOOK_UTILS_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
__CODEX_HOOK_UTILS_SOURCED=1

codex_project_dir() {
  local input="${1:-}"
  local cwd
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null || true)
  if [ -n "$cwd" ]; then
    git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "$cwd"
  else
    git rev-parse --show-toplevel 2>/dev/null || pwd
  fi
}

codex_session_state_dir() {
  local dir="$HOME/.codex/sessions/career_compass"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

codex_tool_command() {
  local input="${1:-}"
  printf '%s' "$input" | jq -r '.tool_input.command // .command // empty' 2>/dev/null || true
}

codex_primary_file_path() {
  local input="${1:-}"
  local direct
  direct=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .file_path // empty' 2>/dev/null || true)
  if [ -n "$direct" ]; then
    printf '%s\n' "$direct"
    return 0
  fi
  codex_changed_files "$input" | head -1
}

codex_changed_files() {
  local input="${1:-}"
  local direct command
  direct=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .file_path // empty' 2>/dev/null || true)
  if [ -n "$direct" ]; then
    printf '%s\n' "$direct"
    return 0
  fi

  command=$(codex_tool_command "$input")
  if [ -z "$command" ]; then
    return 0
  fi

  printf '%s\n' "$command" | awk '
    /^\*\*\* (Add|Update|Delete) File: / {
      sub(/^\*\*\* (Add|Update|Delete) File: /, "")
      print
      next
    }
    /^diff --git / {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^b\//) {
          sub(/^b\//, "", $i)
          print $i
          next
        }
      }
    }
  ' | awk 'NF' | sort -u
}

codex_added_patch_text() {
  local input="${1:-}"
  local tool command
  tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)

  case "$tool" in
    Edit)
      printf '%s' "$input" | jq -r '.tool_input.new_string // empty' 2>/dev/null || true
      return 0
      ;;
    Write)
      printf '%s' "$input" | jq -r '.tool_input.content // empty' 2>/dev/null || true
      return 0
      ;;
  esac

  command=$(codex_tool_command "$input")
  if [ -z "$command" ]; then
    return 0
  fi

  printf '%s\n' "$command" | awk '
    /^\+\+\+ / { next }
    /^\+[^\+]/ { sub(/^\+/, ""); print }
  '
}

codex_old_patch_text() {
  local input="${1:-}"
  local tool command
  tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)

  if [ "$tool" = "Edit" ]; then
    printf '%s' "$input" | jq -r '.tool_input.old_string // empty' 2>/dev/null || true
    return 0
  fi

  command=$(codex_tool_command "$input")
  if [ -z "$command" ]; then
    return 0
  fi

  printf '%s\n' "$command" | awk '
    /^--- / { next }
    /^-[^-]/ { sub(/^-/, ""); print }
  '
}

codex_rel_path() {
  local project="$1"
  local file_path="$2"
  python3 - "$project" "$file_path" <<'PY'
from pathlib import Path
import sys

project = Path(sys.argv[1]).resolve()
path = Path(sys.argv[2])
if not path.is_absolute():
    path = project / path
try:
    print(path.resolve().relative_to(project))
except ValueError:
    print(path)
PY
}

codex_abs_path() {
  local project="$1"
  local file_path="$2"
  python3 - "$project" "$file_path" <<'PY'
from pathlib import Path
import sys

project = Path(sys.argv[1]).resolve()
path = Path(sys.argv[2])
if not path.is_absolute():
    path = project / path
print(path.resolve())
PY
}
