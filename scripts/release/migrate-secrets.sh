#!/bin/zsh
# migrate-secrets.sh -- Migrate career_compass secrets from external codex-company bundle
# to project-internal .secrets/ layout (env x service).
#
# Usage:
#   zsh scripts/release/migrate-secrets.sh --check   [--source <path>] [--project-root <path>]
#   zsh scripts/release/migrate-secrets.sh --migrate [--source <path>] [--project-root <path>] [--force]
#
# --check:         Dry run -- compare key sets between old and new layout. No values printed.
#                  Exit 0 if consistent, exit 1 if mismatch.
# --migrate:       Copy and rearrange source files into .secrets/ under the project root.
#                  Runs --check automatically after migration.
# --source <p>:    Override source root. Default: CODEX_COMPANY_SECRETS_ROOT env var, or
#                  /Users/saoki/work/codex-company/.secrets/career_compass/
# --project-root:  Override project root. Default: two levels above this script.
# --force:         Overwrite existing destination files without prompting.
#
# Variable routing table (old -> new):
#   vercel-production.env  -> production/nextjs.env
#   railway-production.env -> production/fastapi.env
#   vercel-staging.env     -> staging/nextjs.env
#   railway-staging.env    -> staging/fastapi.env
#   github-actions.env     -> ci/github-actions.env
#   cloudflare.env         -> infra/cloudflare.env
#
# Shared vars (INTERNAL_API_JWT_SECRET, CAREER_PRINCIPAL_HMAC_SECRET, TENANT_KEY_SECRET)
# are extracted from BOTH vercel and railway source files and placed into
# production/shared.env and staging/shared.env respectively.
# A WARNING is emitted if the values differ between vercel and railway for the same env.
#
# Safety:
#   - Secret values are never echoed or printed.
#   - Written files use umask 077.
#   - Destination files are gitignored via .secrets/ entry in .gitignore.

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
source "${SCRIPT_DIR}/common.sh"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_SOURCE_ROOT="/Users/saoki/work/codex-company/.secrets/career_compass"

MODE=""
FORCE=0
ARG_SOURCE=""
ARG_PROJECT_ROOT=""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --migrate)
      MODE="migrate"
      shift
      ;;
    --source)
      [[ $# -ge 2 ]] || release_die "--source requires a path argument"
      ARG_SOURCE="$2"
      shift 2
      ;;
    --project-root)
      [[ $# -ge 2 ]] || release_die "--project-root requires a path argument"
      ARG_PROJECT_ROOT="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    *)
      release_die "Unknown argument: $1. Usage: migrate-secrets.sh [--check|--migrate] [--source <path>] [--project-root <path>] [--force]"
      ;;
  esac
done

[[ -n "$MODE" ]] || release_die "Mode required. Pass --check or --migrate."

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------

# Source root: explicit arg > env var > default
if [[ -n "$ARG_SOURCE" ]]; then
  SOURCE_ROOT="$ARG_SOURCE"
elif [[ -n "${CODEX_COMPANY_SECRETS_ROOT:-}" ]]; then
  SOURCE_ROOT="${CODEX_COMPANY_SECRETS_ROOT}/career_compass"
else
  SOURCE_ROOT="$DEFAULT_SOURCE_ROOT"
fi

# Project root
if [[ -n "$ARG_PROJECT_ROOT" ]]; then
  PROJECT_ROOT="$ARG_PROJECT_ROOT"
else
  PROJECT_ROOT="$(release_repo_root "$0")"
fi

DEST_ROOT="${PROJECT_ROOT}/.secrets"

release_log "Source root : ${SOURCE_ROOT}"
release_log "Project root: ${PROJECT_ROOT}"
release_log "Dest root   : ${DEST_ROOT}"

# ---------------------------------------------------------------------------
# Validate source exists
# ---------------------------------------------------------------------------

[[ -d "$SOURCE_ROOT" ]] || release_die "Source directory not found: ${SOURCE_ROOT}"

# ---------------------------------------------------------------------------
# Routing table: source filename -> destination relative path (under DEST_ROOT)
# ---------------------------------------------------------------------------

typeset -a ROUTE_SRCS ROUTE_DESTS
ROUTE_SRCS=(
  "vercel-production.env"
  "railway-production.env"
  "vercel-staging.env"
  "railway-staging.env"
  "github-actions.env"
  "cloudflare.env"
)
ROUTE_DESTS=(
  "production/nextjs.env"
  "production/fastapi.env"
  "staging/nextjs.env"
  "staging/fastapi.env"
  "ci/github-actions.env"
  "infra/cloudflare.env"
)

# Shared vars extracted into shared.env for each environment
SHARED_KEYS=(
  "INTERNAL_API_JWT_SECRET"
  "CAREER_PRINCIPAL_HMAC_SECRET"
  "TENANT_KEY_SECRET"
)

# For each env, the vercel and railway source files and the shared destination
SHARED_ENVS=(production staging)
SHARED_VERCEL_FILES=(vercel-production.env vercel-staging.env)
SHARED_RAILWAY_FILES=(railway-production.env railway-staging.env)
SHARED_DEST_RELS=(production/shared.env staging/shared.env)

# ---------------------------------------------------------------------------
# Helper: resolve route index for a source filename
# Returns -1 if not found
# ---------------------------------------------------------------------------
route_dest_for() {
  local src="$1"
  local idx
  for idx in $(seq 0 $((${#ROUTE_SRCS[@]} - 1))); do
    if [[ "${ROUTE_SRCS[$((idx+1))]}" == "$src" ]]; then
      printf '%s' "${ROUTE_DESTS[$((idx+1))]}"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# Helper: resolve shared env index (0-based) for a source file
# Returns "" if not a shared source
# ---------------------------------------------------------------------------
shared_env_idx_for() {
  local src="$1"
  local idx
  for idx in $(seq 0 $((${#SHARED_ENVS[@]} - 1))); do
    if [[ "${SHARED_VERCEL_FILES[$((idx+1))]}" == "$src" || "${SHARED_RAILWAY_FILES[$((idx+1))]}" == "$src" ]]; then
      printf '%d' "$idx"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# Helper: check if key is a shared key
# ---------------------------------------------------------------------------
is_shared_key() {
  local key="$1"
  local sk
  for sk in "${SHARED_KEYS[@]}"; do
    [[ "$key" == "$sk" ]] && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# parse_env_file <file> <out_keys_var> <out_vals_var> <prefix>
#
# Parses KEY=VALUE pairs from <file>.
# Appends key names to array named <out_keys_var>.
# Stores values in assoc named <out_vals_var> under key "<prefix>:<KEY>".
# Lines starting with # or blank are skipped.
# Values are NEVER printed.
# ---------------------------------------------------------------------------
parse_env_file() {
  local file="$1"
  local keys_var="$2"
  local vals_var="$3"
  local prefix="$4"

  [[ -f "$file" ]] || { release_warn "Source file not found, skipping: ${file}"; return 0; }

  local line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    key="${key## }"; key="${key%% }"
    [[ -z "$key" ]] && continue
    val="${line#*=}"
    # Append key name to the named array
    eval "${keys_var}+=(\"\$key\")"
    # Store value in named assoc (never echoed)
    eval "${vals_var}[\"${prefix}:${key}\"]=\"\${val}\""
  done < "$file"
}

# ---------------------------------------------------------------------------
# Build mapping structures
#
# KEY_TO_DEST[key]         -> dest_rel_path (first-seen wins for reporting)
# DEST_KEY_COUNTS[dest]    -> number of keys going to that destination
# DEST_KEY_NAMES[dest]     -> newline-joined key names for that destination
# OLD_KEY_SET[key]         -> 1 (union of all source keys found)
# NEW_KEY_SET[key]         -> 1 (union of all dest-mapped keys)
#
# Shared var value matching:
# SV_VERCEL_VAL[env_idx:key]   -> value from vercel source
# SV_RAILWAY_VAL[env_idx:key]  -> value from railway source
# SV_BOTH_PRESENT[env_idx:key] -> 1 if both have the key
# SV_MISMATCH[env_idx:key]     -> 1 if values differ
# ---------------------------------------------------------------------------

typeset -A KEY_TO_DEST
typeset -A DEST_KEY_NAMES
typeset -A OLD_KEY_SET
typeset -A NEW_KEY_SET
typeset -A SV_VERCEL_VAL
typeset -A SV_RAILWAY_VAL
typeset -A SV_BOTH_PRESENT
typeset -A SV_MISMATCH

_register_key_to_dest() {
  local key="$1"
  local dest_rel="$2"

  OLD_KEY_SET[$key]=1
  NEW_KEY_SET[$key]=1

  if [[ -z "${KEY_TO_DEST[$key]+_}" ]]; then
    KEY_TO_DEST[$key]="$dest_rel"
  fi

  if [[ -z "${DEST_KEY_NAMES[$dest_rel]+_}" ]]; then
    DEST_KEY_NAMES[$dest_rel]="$key"
  else
    DEST_KEY_NAMES[$dest_rel]+=$'\n'"$key"
  fi
}

# Parse all source files and build structures
for src_idx in $(seq 1 ${#ROUTE_SRCS[@]}); do
  src_file="${ROUTE_SRCS[$src_idx]}"
  primary_dest="${ROUTE_DESTS[$src_idx]}"
  full_src="${SOURCE_ROOT}/${src_file}"

  [[ -f "$full_src" ]] || { release_warn "Source not found, skipping: ${full_src}"; continue; }

  typeset -a fkeys
  typeset -A fvals
  fkeys=()
  fvals=()
  parse_env_file "$full_src" fkeys fvals "$src_file"

  # Determine if this file contributes to shared vars
  senv_idx=""
  if shared_env_idx_for "$src_file" > /dev/null 2>&1; then
    senv_idx="$(shared_env_idx_for "$src_file")"
  fi

  is_vercel=0
  is_railway=0
  if [[ -n "$senv_idx" ]]; then
    [[ "${SHARED_VERCEL_FILES[$((senv_idx+1))]}" == "$src_file" ]] && is_vercel=1
    [[ "${SHARED_RAILWAY_FILES[$((senv_idx+1))]}" == "$src_file" ]] && is_railway=1
  fi

  for key in "${fkeys[@]}"; do
    # Determine actual destination
    actual_dest="$primary_dest"
    if [[ -n "$senv_idx" ]] && is_shared_key "$key"; then
      actual_dest="${SHARED_DEST_RELS[$((senv_idx+1))]}"
      # Track values for consistency check (never printed)
      sv_map_key="${senv_idx}:${key}"
      if (( is_vercel )); then
        SV_VERCEL_VAL[$sv_map_key]="${fvals["${src_file}:${key}"]}"
      elif (( is_railway )); then
        SV_RAILWAY_VAL[$sv_map_key]="${fvals["${src_file}:${key}"]}"
      fi
    fi

    _register_key_to_dest "$key" "$actual_dest"
  done
done

# Check shared var consistency across vercel <-> railway pairs
for senv_idx in $(seq 0 $((${#SHARED_ENVS[@]} - 1))); do
  senv="${SHARED_ENVS[$((senv_idx+1))]}"
  for sk in "${SHARED_KEYS[@]}"; do
    sv_map_key="${senv_idx}:${sk}"
    v_set="${SV_VERCEL_VAL[$sv_map_key]+SET}"
    r_set="${SV_RAILWAY_VAL[$sv_map_key]+SET}"
    if [[ -n "$v_set" && -n "$r_set" ]]; then
      SV_BOTH_PRESENT[$sv_map_key]=1
      if [[ "${SV_VERCEL_VAL[$sv_map_key]}" != "${SV_RAILWAY_VAL[$sv_map_key]}" ]]; then
        SV_MISMATCH[$sv_map_key]=1
        release_warn "[${senv}] Shared var value mismatch for key: ${sk} (vercel vs railway differ)"
      fi
    elif [[ -n "$v_set" && -z "$r_set" ]]; then
      release_warn "[${senv}] Shared var ${sk} found in vercel but missing in railway source."
    elif [[ -z "$v_set" && -n "$r_set" ]]; then
      release_warn "[${senv}] Shared var ${sk} found in railway but missing in vercel source."
    fi
  done
done

# ---------------------------------------------------------------------------
# --check mode
# ---------------------------------------------------------------------------

run_check() {
  release_log "=== migrate-secrets --check ==="
  release_log ""
  release_log "Total keys mapped: ${#KEY_TO_DEST}"
  release_log ""
  release_log "Keys per destination file (key names only, no values):"

  # Sort destination paths for deterministic output
  local dest_sorted
  dest_sorted=(${(k)DEST_KEY_NAMES[(I)*]})
  dest_sorted=(${(o)dest_sorted})  # sort ascending

  for dest_rel in "${dest_sorted[@]}"; do
    local key_count
    key_count="$(print -r -- "${DEST_KEY_NAMES[$dest_rel]}" | grep -c . || true)"
    release_log "  .secrets/${dest_rel} (${key_count} keys):"
    local kn
    while IFS= read -r kn; do
      [[ -n "$kn" ]] && release_log "    - ${kn}"
    done <<< "${DEST_KEY_NAMES[$dest_rel]}"
    release_log ""
  done

  release_log "Shared var consistency:"
  local any_sv_issue=0
  for senv_idx in $(seq 0 $((${#SHARED_ENVS[@]} - 1))); do
    senv="${SHARED_ENVS[$((senv_idx+1))]}"
    for sk in "${SHARED_KEYS[@]}"; do
      sv_map_key="${senv_idx}:${sk}"
      if [[ -n "${SV_MISMATCH[$sv_map_key]+_}" ]]; then
        release_log "  [${senv}] ${sk}: MISMATCH (vercel and railway values differ)"
        any_sv_issue=1
      elif [[ -n "${SV_BOTH_PRESENT[$sv_map_key]+_}" ]]; then
        release_log "  [${senv}] ${sk}: OK"
      else
        release_log "  [${senv}] ${sk}: NOT_CHECKED (key absent in one or both sources)"
      fi
    done
  done

  release_log ""
  release_log "Key union comparison (source union vs destination union):"

  # Source union: re-derive from all source files (independent of routing logic)
  typeset -A raw_src_union
  for src_idx in $(seq 1 ${#ROUTE_SRCS[@]}); do
    src_file="${ROUTE_SRCS[$src_idx]}"
    full_src="${SOURCE_ROOT}/${src_file}"
    [[ -f "$full_src" ]] || continue
    typeset -a uk
    typeset -A uv
    uk=()
    uv=()
    parse_env_file "$full_src" uk uv "_union_${src_file}"
    for k in "${uk[@]}"; do
      raw_src_union[$k]=1
    done
  done

  local missing_in_new=()
  for k in "${(@k)raw_src_union}"; do
    [[ -z "${NEW_KEY_SET[$k]+_}" ]] && missing_in_new+=("$k")
  done

  local extra_in_new=()
  for k in "${(@k)NEW_KEY_SET}"; do
    [[ -z "${raw_src_union[$k]+_}" ]] && extra_in_new+=("$k")
  done

  if [[ ${#missing_in_new} -gt 0 ]]; then
    for k in "${missing_in_new[@]}"; do
      release_warn "  SOURCE key not routed to any destination: ${k}"
    done
  fi

  if [[ ${#extra_in_new} -gt 0 ]]; then
    for k in "${extra_in_new[@]}"; do
      release_warn "  DESTINATION key not present in source: ${k}"
    done
  fi

  if [[ ${#missing_in_new} -eq 0 && ${#extra_in_new} -eq 0 ]]; then
    release_log "  Key union: consistent (source == destination)"
  fi

  release_log ""

  if [[ ${#missing_in_new} -gt 0 || ${#extra_in_new} -gt 0 || "$any_sv_issue" -eq 1 ]]; then
    release_warn "Check FAILED. Review warnings above before running --migrate."
    return 1
  fi

  release_log "Check PASSED."
  return 0
}

# ---------------------------------------------------------------------------
# --migrate mode
# ---------------------------------------------------------------------------

run_migrate() {
  release_log "=== migrate-secrets --migrate ==="
  release_log ""

  local migration_ts
  migration_ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

  # Collect full parsed values for all source files
  typeset -A all_parsed_vals  # "src_file:KEY" -> value (never printed)

  for src_idx in $(seq 1 ${#ROUTE_SRCS[@]}); do
    src_file="${ROUTE_SRCS[$src_idx]}"
    full_src="${SOURCE_ROOT}/${src_file}"
    [[ -f "$full_src" ]] || continue
    typeset -a pk
    typeset -A pv
    pk=()
    pv=()
    parse_env_file "$full_src" pk pv "$src_file"
    for k in "${pk[@]}"; do
      all_parsed_vals["${src_file}:${k}"]="${pv["${src_file}:${k}"]}"
    done
  done

  # Build per-destination sorted KEY=VALUE lines
  # Use associative array: dest_rel -> newline-joined "KEY=VALUE" entries
  typeset -A dest_kv_lines  # dest_rel -> unsorted KEY=VALUE lines

  for src_idx in $(seq 1 ${#ROUTE_SRCS[@]}); do
    src_file="${ROUTE_SRCS[$src_idx]}"
    primary_dest="${ROUTE_DESTS[$src_idx]}"
    full_src="${SOURCE_ROOT}/${src_file}"
    [[ -f "$full_src" ]] || continue

    typeset -a wk
    typeset -A wv
    wk=()
    wv=()
    parse_env_file "$full_src" wk wv "$src_file"

    # Determine shared env index for this source file
    senv_idx=""
    if shared_env_idx_for "$src_file" > /dev/null 2>&1; then
      senv_idx="$(shared_env_idx_for "$src_file")"
    fi

    is_vercel_src=0
    is_railway_src=0
    if [[ -n "$senv_idx" ]]; then
      [[ "${SHARED_VERCEL_FILES[$((senv_idx+1))]}" == "$src_file" ]] && is_vercel_src=1
      [[ "${SHARED_RAILWAY_FILES[$((senv_idx+1))]}" == "$src_file" ]] && is_railway_src=1
    fi

    for key in "${wk[@]}"; do
      actual_dest="$primary_dest"
      if [[ -n "$senv_idx" ]] && is_shared_key "$key"; then
        actual_dest="${SHARED_DEST_RELS[$((senv_idx+1))]}"
        # For railway source of a shared key: skip if vercel already added it
        # (prefer vercel value; mismatch already warned during parse phase)
        if (( is_railway_src )); then
          sv_map_key="${senv_idx}:${key}"
          # If vercel value is present, skip railway value to avoid duplicate
          [[ -n "${SV_VERCEL_VAL[$sv_map_key]+_}" ]] && continue
        fi
      fi

      local val="${all_parsed_vals["${src_file}:${key}"]}"
      local entry="${key}=${val}"

      if [[ -z "${dest_kv_lines[$actual_dest]+_}" ]]; then
        dest_kv_lines[$actual_dest]="$entry"
      else
        dest_kv_lines[$actual_dest]+=$'\n'"$entry"
      fi
    done
  done

  # Apply umask 077 for all written files
  umask 077

  # Write each destination file
  local dest_sorted_write
  dest_sorted_write=(${(k)dest_kv_lines[(I)*]})
  dest_sorted_write=(${(o)dest_sorted_write})

  for dest_rel in "${dest_sorted_write[@]}"; do
    local dest_file="${DEST_ROOT}/${dest_rel}"
    local dest_dir="${dest_file:h}"

    # Prompt before overwriting unless --force
    if [[ -f "$dest_file" && "$FORCE" -eq 0 ]]; then
      release_warn "Destination already exists: ${dest_file}"
      printf '[release] Overwrite? [y/N] ' >&2
      local answer
      read -r answer
      if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        release_log "Skipped: .secrets/${dest_rel}"
        continue
      fi
    fi

    mkdir -p "$dest_dir"

    # Write header comment + sorted KEY=VALUE pairs
    # Values are written to disk but never echoed to terminal
    {
      printf '# migrated: %s\n' "$migration_ts"
      printf '# source:   %s\n' "$SOURCE_ROOT"
      printf '# dest:     .secrets/%s\n' "$dest_rel"
      printf '#\n'
      print -r -- "${dest_kv_lines[$dest_rel]}" | LC_ALL=C sort
    } > "$dest_file"

    release_log "Written: .secrets/${dest_rel}"
  done

  release_log ""
  release_log "All files written. Running --check to verify consistency..."
  release_log ""

  if run_check; then
    release_log ""
    release_log "Migration complete. Run sync-career-compass-secrets.sh --check to verify provider alignment."
  else
    release_die "Post-migration --check failed. Review warnings above."
  fi
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "$MODE" in
  check)
    run_check
    ;;
  migrate)
    run_migrate
    ;;
esac
