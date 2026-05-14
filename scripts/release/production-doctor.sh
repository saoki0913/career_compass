#!/bin/zsh
# Usage: production-doctor.sh [--collect-only] [--fix-loop] [--max-iterations N]
#
# Phase 1: Parallel error collection from 5 sources
# Phase 2: Triage into P0/P1/P2 severity
# Phase 3: JSON output for Claude skill consumption
#
# Exit codes:
#   0 — P0_P1_RESOLVED: all P0/P1 issues resolved (or collect-only/default completes)
#   1 — general failure (collection/triage error)
#   2 — SAME_SIGNATURE_REPEATED: same error signature as previous iteration
#   3 — NEW_ISSUE_INTRODUCED: fix caused new P0/P1
#   4 — MAX_ITERATIONS_REACHED: hit max iterations without resolution
#   5 — MANUAL_ESCALATION_REQUESTED: user chose manual intervention

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/common.sh"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
mode="default"          # default | collect-only | fix-loop
max_iterations=3

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --collect-only)
      mode="collect-only"
      ;;
    --fix-loop)
      mode="fix-loop"
      ;;
    --max-iterations)
      max_iterations="${2:-3}"
      shift
      ;;
    -h|--help)
      print -r -- "Usage: $0 [--collect-only] [--fix-loop] [--max-iterations N]" >&2
      print -r -- "" >&2
      print -r -- "  --collect-only       Run Phase 1+2 only, print triage.json path, exit 0" >&2
      print -r -- "  --fix-loop           After Phase 1+2, enter repair loop (for Claude skill)" >&2
      print -r -- "  --max-iterations N   Maximum repair iterations (default: 3)" >&2
      exit 0
      ;;
    *)
      release_die "Unknown argument: $1"
      ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Preflight: require dependencies
# ---------------------------------------------------------------------------
require_real_binary curl
require_real_binary jq

# ---------------------------------------------------------------------------
# Phase 1: Parallel Error Collection
# ---------------------------------------------------------------------------
collect_errors() {
  local report_dir="${repo_root}/.doctor-reports/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$report_dir"

  release_log "[doctor] Starting parallel error collection -> ${report_dir}"

  # --- Collector 1: verify-health.sh (production health + HTTP) ---
  if [[ -x "${script_dir}/verify-health.sh" ]]; then
    zsh "${script_dir}/verify-health.sh" production --retries 3 --delay 5 \
      > "${report_dir}/health.txt" 2>&1 &
  else
    local skills_verify="${repo_root}/.claude/skills/production-doctor/verify-production.sh"
    if [[ -x "$skills_verify" ]]; then
      bash "$skills_verify" > "${report_dir}/health.txt" 2>&1 &
    else
      {
        local frontend_code backend_code
        frontend_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
          https://www.shupass.jp/ 2>/dev/null || echo "000")"
        backend_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
          https://shupass-backend-production.up.railway.app/health 2>/dev/null || echo "000")"
        echo "FRONTEND_STATUS=${frontend_code}"
        echo "BACKEND_STATUS=${backend_code}"
        if [[ "$frontend_code" == "200" && "$backend_code" == "200" ]]; then
          echo "STATUS: HEALTHY"
        else
          echo "STATUS: UNHEALTHY"
        fi
      } > "${report_dir}/health.txt" 2>&1 &
    fi
  fi

  # --- Collector 2: Secret drift check ---
  zsh "${script_dir}/sync-career-compass-secrets.sh" --check --target all \
    2>&1 | redact_output > "${report_dir}/secret-drift.txt" &

  # --- Collector 3: Sentry errors (optional, stub if absent) ---
  local skills_sentry="${repo_root}/.claude/skills/production-doctor/fetch-sentry-errors.sh"
  if [[ -x "$skills_sentry" ]]; then
    bash "$skills_sentry" --since=24h --project=both \
      > "${report_dir}/sentry.json" 2>&1 &
  else
    print -r -- '{"status":"skipped","reason":"fetch-sentry-errors.sh not found"}' \
      > "${report_dir}/sentry.json" &
  fi

  # --- Collector 4: Railway logs (optional, stub if absent) ---
  local skills_railway="${repo_root}/.claude/skills/production-doctor/fetch-railway-logs.sh"
  if [[ -x "$skills_railway" ]]; then
    bash "$skills_railway" --tail=500 --filter=errors \
      2>&1 | redact_output > "${report_dir}/railway.txt" &
  else
    print -r -- "SKIPPED: fetch-railway-logs.sh not found" \
      > "${report_dir}/railway.txt" &
  fi

  # --- Collector 5: DNS / SSL check ---
  {
    curl -sI --max-time 15 https://www.shupass.jp 2>&1 | head -5 || true
  } > "${report_dir}/ssl-check.txt" &

  wait
  release_log "[doctor] Collection complete"
  print -r -- "$report_dir"
}

# ---------------------------------------------------------------------------
# Phase 2: Triage — classify issues by severity
# ---------------------------------------------------------------------------
triage_reports() {
  local report_dir="$1"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local issues_json="[]"
  local issue_id_counter=0

  add_issue() {
    local priority="$1" source="$2" description="$3" action="$4" signature="$5"
    issue_id_counter=$(( issue_id_counter + 1 ))
    local id="${source}-$(printf '%03d' "$issue_id_counter")"
    issues_json="$(print -r -- "$issues_json" | jq -c \
      --arg id "$id" \
      --arg priority "$priority" \
      --arg source "$source" \
      --arg description "$description" \
      --arg action "$action" \
      --arg signature "$signature" \
      '. + [{id: $id, priority: $priority, source: $source, description: $description, suggested_action: $action, signature: $signature}]')"
  }

  # --- Triage: health.txt ---
  if [[ -f "${report_dir}/health.txt" ]]; then
    local health_content
    health_content="$(cat "${report_dir}/health.txt")"
    if print -r -- "$health_content" | grep -qE 'STATUS: UNHEALTHY|\[FAIL\]'; then
      local fail_lines
      fail_lines="$(print -r -- "$health_content" | grep -E '\[FAIL\]' | head -3 | tr '\n' ';' || true)"
      add_issue "P0" "health" \
        "Production health check failed: ${fail_lines:-see health.txt}" \
        "Check Vercel/Railway deployment status and run make deploy-check" \
        "health-unhealthy"
    fi
    if print -r -- "$health_content" | grep -qE 'Connection failed|curl.*000'; then
      add_issue "P0" "health" \
        "DNS or connectivity failure detected (curl returned 000)" \
        "Verify DNS propagation and network connectivity for shupass.jp" \
        "health-connection-failure"
    fi
  fi

  # --- Triage: secret-drift.txt ---
  if [[ -f "${report_dir}/secret-drift.txt" ]]; then
    local drift_content
    drift_content="$(cat "${report_dir}/secret-drift.txt")"
    if print -r -- "$drift_content" | grep -qiE 'MISMATCH|DRIFT|MISSING|drift detected'; then
      add_issue "P1" "secrets" \
        "Secret drift detected between canonical bundle and provider" \
        "Run: zsh scripts/release/sync-career-compass-secrets.sh --apply --target all" \
        "secret-drift"
    fi
    if print -r -- "$drift_content" | grep -qiE '^ERROR|^FAIL'; then
      add_issue "P1" "secrets" \
        "Secret sync check returned errors; verify canonical bundle integrity" \
        "Run: zsh scripts/release/sync-career-compass-secrets.sh --check and inspect output" \
        "secret-check-error"
    fi
  fi

  # --- Triage: sentry.json ---
  if [[ -f "${report_dir}/sentry.json" ]]; then
    local sentry_content
    sentry_content="$(cat "${report_dir}/sentry.json")"
    if ! print -r -- "$sentry_content" | jq -e '.status == "skipped"' > /dev/null 2>&1; then
      local frontend_count backend_count
      frontend_count="$(print -r -- "$sentry_content" | jq '.frontend | length' 2>/dev/null || echo "0")"
      backend_count="$(print -r -- "$sentry_content" | jq '.backend | length' 2>/dev/null || echo "0")"

      if (( frontend_count > 0 )); then
        local recent_critical
        recent_critical="$(print -r -- "$sentry_content" | \
          jq '[.frontend[] | select(.level == "fatal" or .level == "error")] | length' 2>/dev/null || echo "0")"
        if (( recent_critical > 0 )); then
          add_issue "P0" "sentry" \
            "Sentry frontend: ${recent_critical} unresolved error/fatal issues in last 24h" \
            "Inspect Sentry frontend project (career-compass-frontend) and fix top errors" \
            "sentry-frontend-errors-${recent_critical}"
        else
          add_issue "P1" "sentry" \
            "Sentry frontend: ${frontend_count} unresolved issues (non-critical)" \
            "Review Sentry frontend issues and prioritize any user-impacting ones" \
            "sentry-frontend-issues-${frontend_count}"
        fi
      fi

      if (( backend_count > 0 )); then
        local recent_backend_critical
        recent_backend_critical="$(print -r -- "$sentry_content" | \
          jq '[.backend[] | select(.level == "fatal" or .level == "error")] | length' 2>/dev/null || echo "0")"
        if (( recent_backend_critical > 0 )); then
          add_issue "P0" "sentry" \
            "Sentry backend: ${recent_backend_critical} unresolved error/fatal issues in last 24h" \
            "Inspect Sentry backend project (career-compass-backend) and fix top errors" \
            "sentry-backend-errors-${recent_backend_critical}"
        else
          add_issue "P1" "sentry" \
            "Sentry backend: ${backend_count} unresolved issues (non-critical)" \
            "Review Sentry backend issues and prioritize any user-impacting ones" \
            "sentry-backend-issues-${backend_count}"
        fi
      fi
    fi
  fi

  # --- Triage: railway.txt ---
  if [[ -f "${report_dir}/railway.txt" ]]; then
    local railway_content
    railway_content="$(cat "${report_dir}/railway.txt")"
    if ! print -r -- "$railway_content" | grep -qE 'SKIPPED:'; then
      if print -r -- "$railway_content" | grep -qiE '\[MEMORY\]|OOM|MemoryError|Killed|SIGKILL'; then
        add_issue "P0" "railway" \
          "Railway backend OOM or memory kill detected in recent logs" \
          "Scale Railway instance memory or investigate memory leak in backend" \
          "railway-oom"
      fi
      if print -r -- "$railway_content" | grep -qiE '\[HTTP_ERROR\]| 500 | 502 | 503 '; then
        add_issue "P0" "railway" \
          "Railway backend HTTP 5xx errors detected in recent logs" \
          "Check Railway backend logs for unhandled exceptions and fix root cause" \
          "railway-http5xx"
      fi
      if print -r -- "$railway_content" | grep -qiE '\[TIMEOUT\]|[Tt]imeout'; then
        add_issue "P1" "railway" \
          "Railway backend timeout errors detected in recent logs" \
          "Profile slow endpoints; consider adding async handling or caching" \
          "railway-timeout"
      fi
      if print -r -- "$railway_content" | grep -qiE '\[PYTHON_ERROR\]|Traceback|RuntimeError'; then
        add_issue "P1" "railway" \
          "Railway backend Python exceptions detected in recent logs" \
          "Review traceback in railway.txt and fix the offending code path" \
          "railway-python-error"
      fi
    fi
  fi

  # --- Triage: ssl-check.txt ---
  if [[ -f "${report_dir}/ssl-check.txt" ]]; then
    local ssl_content first_line http_status
    ssl_content="$(cat "${report_dir}/ssl-check.txt")"
    first_line="$(print -r -- "$ssl_content" | head -1 || true)"
    if print -r -- "$first_line" | grep -qE 'HTTP/[0-9.]+'; then
      http_status="$(print -r -- "$first_line" | grep -oE '[0-9]{3}' | head -1 || echo "000")"
      if [[ "$http_status" != "200" && "$http_status" != "301" && "$http_status" != "302" && "$http_status" != "000" ]]; then
        add_issue "P0" "ssl" \
          "SSL/HTTPS check returned unexpected HTTP status ${http_status} for https://www.shupass.jp" \
          "Verify Vercel deployment and TLS certificate for www.shupass.jp" \
          "ssl-status-${http_status}"
      fi
    fi
    if print -r -- "$ssl_content" | grep -qiE 'Could not resolve|Failed to connect|curl: \(6\)|curl: \(7\)'; then
      add_issue "P0" "ssl" \
        "DNS resolution or connection failure for https://www.shupass.jp" \
        "Check DNS records and network connectivity; verify Vercel domain binding" \
        "ssl-connection-failure"
    fi
  fi

  # --- Build summary ---
  local p0_count p1_count p2_count total
  p0_count="$(print -r -- "$issues_json" | jq '[.[] | select(.priority == "P0")] | length')"
  p1_count="$(print -r -- "$issues_json" | jq '[.[] | select(.priority == "P1")] | length')"
  p2_count="$(print -r -- "$issues_json" | jq '[.[] | select(.priority == "P2")] | length')"
  total="$(print -r -- "$issues_json" | jq 'length')"

  local triage_json
  triage_json="$(jq -n -c \
    --arg timestamp "$timestamp" \
    --arg report_dir "$report_dir" \
    --argjson issues "$issues_json" \
    --argjson p0 "$p0_count" \
    --argjson p1 "$p1_count" \
    --argjson p2 "$p2_count" \
    --argjson total "$total" \
    '{
      timestamp: $timestamp,
      report_dir: $report_dir,
      issues: $issues,
      summary: {
        p0_count: $p0,
        p1_count: $p1,
        p2_count: $p2,
        total: $total
      }
    }')"

  print -r -- "$triage_json" > "${report_dir}/triage.json"
  print -r -- "${report_dir}/triage.json"
}

# ---------------------------------------------------------------------------
# Print human-readable summary
# ---------------------------------------------------------------------------
print_summary() {
  local triage_path="$1"
  local triage p0 p1 p2 total
  triage="$(cat "$triage_path")"
  p0="$(print -r -- "$triage" | jq '.summary.p0_count')"
  p1="$(print -r -- "$triage" | jq '.summary.p1_count')"
  p2="$(print -r -- "$triage" | jq '.summary.p2_count')"
  total="$(print -r -- "$triage" | jq '.summary.total')"

  print -r -- ""
  print -r -- "=== Production Doctor Report ==="
  print -r -- "Timestamp : $(print -r -- "$triage" | jq -r '.timestamp')"
  print -r -- "Report dir: $(print -r -- "$triage" | jq -r '.report_dir')"
  print -r -- "Triage    : ${triage_path}"
  print -r -- ""
  print -r -- "P0 (Critical) : ${p0}"
  print -r -- "P1 (Important): ${p1}"
  print -r -- "P2 (Low)      : ${p2}"
  print -r -- "Total issues  : ${total}"
  print -r -- ""

  if (( total > 0 )); then
    print -r -- "Issues:"
    print -r -- "$triage" | jq -r '.issues[] | "  [\(.priority)] [\(.source)] \(.description)"'
  else
    print -r -- "No issues detected. Production appears healthy."
  fi
  print -r -- ""
}

# ---------------------------------------------------------------------------
# Compute sorted comma-delimited signature string for iteration comparison
# ---------------------------------------------------------------------------
compute_issue_signatures() {
  local triage_path="$1"
  cat "$triage_path" | jq -r '.issues[].signature' 2>/dev/null | sort | tr '\n' ',' || true
}

# ---------------------------------------------------------------------------
# Fix-loop: max 3 iterations, 5 explicit exit conditions
# ---------------------------------------------------------------------------
run_fix_loop() {
  local iteration=1
  local prev_signatures=""

  while (( iteration <= max_iterations )); do
    release_log "[doctor] Fix-loop iteration ${iteration}/${max_iterations}"

    local report_dir triage_path triage p0 p1 current_signatures
    report_dir="$(collect_errors)"
    triage_path="$(triage_reports "$report_dir")"
    print_summary "$triage_path"

    triage="$(cat "$triage_path")"
    p0="$(print -r -- "$triage" | jq '.summary.p0_count')"
    p1="$(print -r -- "$triage" | jq '.summary.p1_count')"

    # Exit condition 1: P0_P1_RESOLVED
    if (( p0 == 0 && p1 == 0 )); then
      release_log "[doctor] EXIT: P0_P1_RESOLVED — all critical issues resolved"
      print -r -- "DOCTOR_EXIT_CODE=P0_P1_RESOLVED"
      print -r -- "TRIAGE_PATH=${triage_path}"
      exit 0
    fi

    current_signatures="$(compute_issue_signatures "$triage_path")"

    # Exit condition 2: SAME_SIGNATURE_REPEATED
    if [[ -n "$prev_signatures" && "$current_signatures" == "$prev_signatures" ]]; then
      release_warn "[doctor] EXIT: SAME_SIGNATURE_REPEATED — fix had no effect on error signatures"
      print -r -- "DOCTOR_EXIT_CODE=SAME_SIGNATURE_REPEATED"
      print -r -- "TRIAGE_PATH=${triage_path}"
      exit 2
    fi

    # Exit condition 3: NEW_ISSUE_INTRODUCED
    if [[ -n "$prev_signatures" ]]; then
      local new_p0_p1_sigs old_sigs_file new_sigs_file newly_introduced
      old_sigs_file="$(mktemp)"
      new_sigs_file="$(mktemp)"
      new_p0_p1_sigs="$(print -r -- "$triage" | jq -r \
        '[.issues[] | select(.priority == "P0" or .priority == "P1") | .signature] | sort | .[]' \
        2>/dev/null || true)"
      print -r -- "${prev_signatures//,/$'\n'}" | sort | grep -v '^$' > "$old_sigs_file" || true
      print -r -- "$new_p0_p1_sigs" | sort | grep -v '^$' > "$new_sigs_file" || true
      newly_introduced="$(comm -23 "$new_sigs_file" "$old_sigs_file" || true)"
      rm -f "$old_sigs_file" "$new_sigs_file"

      if [[ -n "$newly_introduced" ]]; then
        release_warn "[doctor] EXIT: NEW_ISSUE_INTRODUCED — new P0/P1 signatures: ${newly_introduced}"
        print -r -- "DOCTOR_EXIT_CODE=NEW_ISSUE_INTRODUCED"
        print -r -- "TRIAGE_PATH=${triage_path}"
        print -r -- "NEW_SIGNATURES=${newly_introduced}"
        exit 3
      fi
    fi

    prev_signatures="$current_signatures"

    # Exit condition 4: MAX_ITERATIONS_REACHED
    if (( iteration >= max_iterations )); then
      release_warn "[doctor] EXIT: MAX_ITERATIONS_REACHED — ${p0} P0 and ${p1} P1 issues remain after ${max_iterations} iterations"
      print -r -- "DOCTOR_EXIT_CODE=MAX_ITERATIONS_REACHED"
      print -r -- "TRIAGE_PATH=${triage_path}"
      print -r -- "REMAINING_P0=${p0}"
      print -r -- "REMAINING_P1=${p1}"
      exit 4
    fi

    # Output for Claude skill to read, apply fixes, then re-invoke
    print -r -- "DOCTOR_ITERATION=${iteration}"
    print -r -- "TRIAGE_PATH=${triage_path}"
    print -r -- "DOCTOR_AWAITING_FIX=1"

    # Exit 5 (MANUAL_ESCALATION_REQUESTED) is signalled by the Claude skill
    # by writing a sentinel file; in shell-only mode we exit here after each
    # iteration so the orchestrator can apply fixes between iterations.
    exit 0
  done
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
cd "$repo_root"

case "$mode" in
  collect-only)
    release_log "[doctor] Mode: collect-only"
    report_dir="$(collect_errors)"
    triage_path="$(triage_reports "$report_dir")"
    print_summary "$triage_path"
    print -r -- "TRIAGE_PATH=${triage_path}"
    exit 0
    ;;
  fix-loop)
    release_log "[doctor] Mode: fix-loop (max ${max_iterations} iterations)"
    run_fix_loop
    ;;
  default)
    release_log "[doctor] Mode: default (collect + triage + summary)"
    report_dir="$(collect_errors)"
    triage_path="$(triage_reports "$report_dir")"
    print_summary "$triage_path"
    print -r -- "TRIAGE_PATH=${triage_path}"
    exit 0
    ;;
esac
