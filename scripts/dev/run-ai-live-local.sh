#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

cd "$repo_root"

# Match Next.js dev env load order (later files override earlier) so CI_E2E_AUTH_SECRET
# is visible here when set in .env / .env.development (not only .env.local).
load_repo_env_file() {
  local f="$1"
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$f"
    set +a
  fi
}

load_repo_env_file ".env"
load_repo_env_file ".env.development"
load_repo_env_file ".env.local"
load_repo_env_file ".env.development.local"

suite="${SUITE:-${AI_LIVE_SUITE:-extended}}"
timestamp="${AI_LIVE_LOCAL_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
default_output_dir="backend/tests/output/local_ai_live/${suite}_${timestamp}"
output_dir="${OUTPUT_DIR:-${AI_LIVE_LOCAL_OUTPUT_DIR:-$default_output_dir}}"
features_arg="${AI_LIVE_LOCAL_FEATURES:-all}"
skip_es_review_playwright="${AI_LIVE_LOCAL_SKIP_ES_REVIEW_PLAYWRIGHT:-1}"
web_port=""
base_url=""
fastapi_health_url="${AI_LIVE_LOCAL_FASTAPI_HEALTH_URL:-http://localhost:8000/health}"
expected_features_csv="company_info_search,selection_schedule,rag_ingest,gakuchika,motivation,interview,es_review"
feature_workspace_root="${output_dir%/}/_feature_runs"
next_log_path="${output_dir%/}/next-dev.log"
fastapi_log_path="${output_dir%/}/fastapi.log"
summary_log_path="${output_dir%/}/summary.log"
auth_preflight_log_path="${output_dir%/}/auth-preflight.log"
principal_preflight_log_path="${output_dir%/}/principal-preflight.log"
db_bootstrap_log_path="${output_dir%/}/db-bootstrap.log"
snapshot_hash=""
snapshot_files_json="[]"
auth_preflight_status="not_run"
principal_preflight_status="not_run"

next_pid=""
fastapi_pid=""
overall_status=0
feature_child_pids=()
feature_timeout="${AI_LIVE_LOCAL_FEATURE_TIMEOUT:-600}"
ci_e2e_auth_secret="${CI_E2E_AUTH_SECRET:-}"

readonly features=(
  "company-info-search"
  "selection-schedule"
  "rag-ingest"
  "gakuchika"
  "motivation"
  "interview"
  "es-review"
  "calendar"
  "tasks-deadlines"
  "notifications"
  "company-crud"
  "billing"
  "search-query"
  "pages-smoke"
)

readonly stateful_features=(
  "es-review"
  "gakuchika"
  "motivation"
  "interview"
  "calendar"
  "tasks-deadlines"
  "notifications"
  "company-crud"
  "search-query"
)

selected_features=()

log() {
  printf '[ai-live-local] %s\n' "$*"
}

die() {
  log "$*"
  exit 1
}

is_stateful_feature() {
  local feature="$1"
  local item
  for item in "${stateful_features[@]}"; do
    if [[ "$item" == "$feature" ]]; then
      return 0
    fi
  done
  return 1
}

select_features() {
  local requested_features=()
  local feature normalized

  if [[ "$features_arg" == "all" ]]; then
    selected_features=("${features[@]}")
  else
    IFS=',' read -r -a requested_features <<< "$features_arg"
    for feature in "${requested_features[@]}"; do
      normalized="$(echo "$feature" | tr -d '[:space:]')"
      case "$normalized" in
        company-info-search|selection-schedule|rag-ingest|gakuchika|motivation|interview|es-review|calendar|tasks-deadlines|notifications|company-crud|billing|search-query|pages-smoke)
          selected_features+=("$normalized")
          ;;
        *)
          die "unsupported AI_LIVE_LOCAL_FEATURES entry: ${normalized}"
          ;;
      esac
    done
  fi

  if [[ ${#selected_features[@]} -eq 0 ]]; then
    die "AI_LIVE_LOCAL_FEATURES did not resolve to any features"
  fi

  expected_features_csv="$(
    printf '%s\n' "${selected_features[@]}" \
      | sed 's/-/_/g' \
      | paste -sd, -
  )"
}

ensure_required_env() {
  local missing=()
  local required_envs=(
    "BETTER_AUTH_SECRET"
    "CAREER_PRINCIPAL_HMAC_SECRET"
    "OPENAI_API_KEY"
    "ANTHROPIC_API_KEY"
    "GOOGLE_API_KEY"
    "DATABASE_URL"
  )

  local name
  for name in "${required_envs[@]}"; do
    if [[ -z "${!name:-}" ]]; then
      missing+=("$name")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    {
      log "missing required environment variables for local AI Live:"
      for name in "${missing[@]}"; do
        case "$name" in
          BETTER_AUTH_SECRET)
            log "- ${name}: Better Auth session signing"
            ;;
          CAREER_PRINCIPAL_HMAC_SECRET)
            log "- ${name}: Next.js -> FastAPI principal HMAC signing for local AI routes"
            ;;
          OPENAI_API_KEY)
            log "- ${name}: ES review / embeddings / company info live calls"
            ;;
          ANTHROPIC_API_KEY)
            log "- ${name}: extended ES review provider set"
            ;;
          GOOGLE_API_KEY)
            log "- ${name}: extended ES review provider set"
            ;;
          DATABASE_URL)
            log "- ${name}: local DB connection for Next.js API and state reset"
            ;;
          *)
            log "- ${name}"
            ;;
        esac
      done
    } >&2
    exit 1
  fi
}

ensure_dir() {
  mkdir -p "$output_dir" "$feature_workspace_root"
}

normalize_json_array_env() {
  local env_name="$1"
  local fallback_json="$2"
  local current="${!env_name:-}"
  if [[ -z "$current" ]]; then
    export "$env_name=$fallback_json"
    return 0
  fi

  if ENV_VALUE="$current" node - <<'NODE' >/dev/null 2>&1
try {
  const parsed = JSON.parse(process.env.ENV_VALUE || "");
  process.exit(Array.isArray(parsed) ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
  then
    return 0
  fi

  ENV_VALUE="$current" node - <<'NODE'
const raw = (process.env.ENV_VALUE || "").trim();
const normalized = raw.replace(/^\[/, "").replace(/\]$/, "");
const items = normalized
  .split(",")
  .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
  .filter(Boolean);
process.stdout.write(JSON.stringify(items));
NODE
}

generate_auth_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return 0
  fi

  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
}

cleanup_process() {
  local name="$1"
  local pid="$2"
  if [[ -z "$pid" ]]; then
    return 0
  fi
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  log "stopping ${name} (pid=${pid})"
  kill "$pid" >/dev/null 2>&1 || true
  wait "$pid" >/dev/null 2>&1 || true
}

kill_stale_runs() {
  local my_pid=$$
  local stale_pids
  stale_pids=$(pgrep -f "run-ai-live-local\\.sh" 2>/dev/null || true)
  for pid in $stale_pids; do
    if [[ "$pid" != "$my_pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log "killing stale run-ai-live-local.sh (pid=${pid})"
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    fi
  done
}

cleanup() {
  local exit_code=$?
  set +e
  if [[ ${#feature_child_pids[@]} -gt 0 ]]; then
    for cpid in "${feature_child_pids[@]}"; do
      if kill -0 "$cpid" 2>/dev/null; then
        log "killing feature child (pid=${cpid})"
        kill -- -"$cpid" 2>/dev/null || kill "$cpid" 2>/dev/null || true
      fi
    done
    feature_child_pids=()
  fi
  cleanup_process "FastAPI" "$fastapi_pid"
  cleanup_process "Next.js" "$next_pid"
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

start_next() {
  log "starting Next.js dev server -> ${next_log_path}"
  env \
    CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret" \
    NEXT_PUBLIC_APP_URL="$base_url" \
    BETTER_AUTH_URL="$base_url" \
    PORT="$web_port" \
    ./node_modules/.bin/next dev >"$next_log_path" 2>&1 &
  next_pid=$!
}

start_fastapi() {
  log "starting FastAPI server -> ${fastapi_log_path}"
  (
    cd backend
    if [[ -f .venv/bin/activate ]]; then
      # shellcheck disable=SC1091
      source .venv/bin/activate
    fi
    exec env \
      CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret" \
      GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY="${GAKUCHIKA_MIN_USER_ANSWERS_FOR_ES_DRAFT_READY:-3}" \
      AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES="${AI_LIVE_LOCAL_RELAX_GAKUCHIKA_GATES:-1}" \
      uvicorn app.main:app --reload --port 8000
  ) >"$fastapi_log_path" 2>&1 &
  fastapi_pid=$!
}

wait_for_http() {
  local name="$1"
  local url="$2"
  local max_attempts="${3:-90}"
  local sleep_seconds="${4:-2}"
  local attempt

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log "${name} is ready: ${url}"
      return 0
    fi
    sleep "$sleep_seconds"
  done

  log "${name} did not become ready: ${url}"
  if [[ -f "$next_log_path" ]]; then
    log "last Next.js log lines:"
    tail -n 20 "$next_log_path" >&2 || true
  fi
  if [[ -f "$fastapi_log_path" ]]; then
    log "last FastAPI log lines:"
    tail -n 20 "$fastapi_log_path" >&2 || true
  fi
  return 1
}

read_next_base_url_from_log() {
  if [[ ! -f "$next_log_path" ]]; then
    return 1
  fi

  awk '
    match($0, /http:\/\/localhost:[0-9]+/) {
      value = substr($0, RSTART, RLENGTH)
    }
    END {
      if (value != "") {
        print value
      }
    }
  ' "$next_log_path"
}

wait_for_next() {
  local max_attempts="${1:-90}"
  local sleep_seconds="${2:-2}"
  local attempt candidate

  for ((attempt = 1; attempt <= max_attempts; attempt += 1)); do
    candidate="$(read_next_base_url_from_log || true)"
    if [[ -n "$candidate" ]]; then
      base_url="$candidate"
    fi

    if curl -fsS "$base_url" >/dev/null 2>&1; then
      log "Next.js is ready: ${base_url}"
      return 0
    fi
    sleep "$sleep_seconds"
  done

  log "Next.js did not become ready: ${base_url}"
  if [[ -f "$next_log_path" ]]; then
    log "last Next.js log lines:"
    tail -n 20 "$next_log_path" >&2 || true
  fi
  return 1
}

database_endpoint_info() {
  node - <<'NODE'
const raw = process.env.DATABASE_URL || "";
if (!raw) {
  console.log("missing\t\t");
  process.exit(0);
}

try {
  const url = new URL(raw);
  const host = url.hostname || "";
  const port = String(Number(url.port || 5432));
  const isLocal = ["localhost", "127.0.0.1"].includes(host) ? "yes" : "no";
  console.log(`${isLocal}\t${host}\t${port}`);
} catch {
  console.log("parse_error\t\t");
}
NODE
}

database_tcp_reachable() {
  local host="$1"
  local port="$2"

  DB_HOST="$host" DB_PORT="$port" node - <<'NODE'
const net = require("node:net");
const host = process.env.DB_HOST || "";
const port = Number(process.env.DB_PORT || "0");

if (!host || !Number.isFinite(port) || port <= 0) {
  process.exit(2);
}

const socket = net.createConnection({ host, port });
const timer = setTimeout(() => {
  socket.destroy();
  process.exit(1);
}, 1500);

socket.on("connect", () => {
  clearTimeout(timer);
  socket.end();
  process.exit(0);
});

socket.on("error", () => {
  clearTimeout(timer);
  process.exit(1);
});
NODE
}

curl_http_ok() {
  local url="$1"
  local code=""
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || true)"
  [[ "$code" =~ ^(2|3)[0-9]{2}$ ]]
}

parse_localhost_port_from_base_url() {
  local u="$1"
  if [[ "$u" =~ ^https?://(localhost|127\.0\.0\.1):([0-9]+)(/|$) ]]; then
    printf '%s\n' "${BASH_REMATCH[2]}"
    return 0
  fi
  return 1
}

probe_existing_next_base_url() {
  local candidate
  for candidate in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
    if curl_http_ok "http://127.0.0.1:${candidate}/"; then
      printf '%s\n' "http://localhost:${candidate}"
      return 0
    fi
  done
  return 1
}

select_web_port() {
  local requested_port="${AI_LIVE_LOCAL_PORT:-}"
  local candidate

  if [[ -n "$requested_port" ]]; then
    if database_tcp_reachable "127.0.0.1" "$requested_port"; then
      die "AI_LIVE_LOCAL_PORT=${requested_port} is already in use"
    fi
    printf '%s\n' "$requested_port"
    return 0
  fi

  for candidate in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010; do
    if ! database_tcp_reachable "127.0.0.1" "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  die "Could not find an available localhost port for Next.js AI Live"
}

ensure_local_database() {
  local db_info db_local host port
  db_info="$(database_endpoint_info)"
  IFS=$'\t' read -r db_local host port <<< "$db_info"

  case "$db_local" in
    missing)
      die "DATABASE_URL is required for local AI Live"
      ;;
    parse_error)
      die "DATABASE_URL could not be parsed"
      ;;
    no)
      log "DATABASE_URL points to a non-local host; skipping local DB auto-start"
      return 0
      ;;
    yes) ;;
    *)
      die "Unexpected DATABASE_URL inspection result: ${db_local}"
      ;;
  esac

  if database_tcp_reachable "$host" "$port"; then
    log "local DB is reachable at ${host}:${port}"
    return 0
  fi

  log "local DB is unreachable at ${host}:${port}; attempting make db-up -> ${db_bootstrap_log_path}"
  if ! make db-up >"$db_bootstrap_log_path" 2>&1; then
    log "make db-up failed"
    tail -n 40 "$db_bootstrap_log_path" >&2 || true
    die "DATABASE_URL is local but DB is unreachable, and make db-up failed"
  fi

  if database_tcp_reachable "$host" "$port"; then
    log "local DB became reachable after make db-up"
    return 0
  fi

  tail -n 40 "$db_bootstrap_log_path" >&2 || true
  die "DATABASE_URL is local but DB is still unreachable after make db-up"
}

copy_feature_bundle() {
  local feature_run_dir="$1"

  if [[ -z "$feature_run_dir" || ! -d "$feature_run_dir" ]]; then
    return 1
  fi

  while IFS= read -r artifact; do
    cp "$artifact" "$output_dir/"
  done < <(find "$feature_run_dir" -maxdepth 1 -type f \( -name 'live_*.json' -o -name 'live_*.md' \) | sort)

  return 0
}

find_feature_run_dir() {
  local feature="$1"
  local feature_workspace="${feature_workspace_root%/}/${feature}"

  find "$feature_workspace" -mindepth 1 -maxdepth 1 -type d -name 'ai_live_*' | sort | tail -n 1
}

load_snapshot_metadata() {
  local snapshot_json
  snapshot_json="$(node scripts/ci/e2e-functional-snapshot.mjs)"
  snapshot_hash="$(
    SNAPSHOT_JSON="$snapshot_json" node - <<'NODE'
const snapshot = JSON.parse(process.env.SNAPSHOT_JSON || "{}");
process.stdout.write(String(snapshot.snapshotHash || "no-staged-files"));
NODE
  )"
  snapshot_files_json="$(
    SNAPSHOT_JSON="$snapshot_json" node - <<'NODE'
const snapshot = JSON.parse(process.env.SNAPSHOT_JSON || "{}");
process.stdout.write(JSON.stringify(Array.isArray(snapshot.snapshotFiles) ? snapshot.snapshotFiles : []));
NODE
  )"

  if [[ "$snapshot_hash" == "no-staged-files" ]]; then
    log "staged snapshot is empty; local manifest will be marked as no-staged-files until files are staged"
  else
    log "captured staged snapshot hash: ${snapshot_hash}"
  fi
}

write_local_feature_status() {
  local feature="$1"
  local feature_run_dir="$2"

  if [[ -z "$feature_run_dir" ]]; then
    log "feature run directory not found for ${feature}"
    return 1
  fi

  node scripts/ci/write-local-ai-status.mjs \
    --feature "$feature" \
    --suite "$suite" \
    --run-dir "$feature_run_dir" \
    --snapshot-hash "$snapshot_hash" \
    --snapshot-files-json "$snapshot_files_json" \
    --auth-preflight-status "$auth_preflight_status" \
    --principal-preflight-status "$principal_preflight_status" >/dev/null
}

run_reset() {
  local scope="$1"
  log "resetting local AI Live state for scope=${scope}"
  env \
    CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret" \
    node scripts/ci/reset-ai-live-state.mjs --base-url "$base_url" --scope "$scope"
}

run_feature_isolated() {
  local feature="$1"
  local scope="local-ai-live-${timestamp}-${feature}"
  local feature_workspace="${feature_workspace_root%/}/${feature}"
  local feature_run_dir=""
  local feature_failed=0

  mkdir -p "$feature_workspace"

  if is_stateful_feature "$feature"; then
    if ! run_reset "$scope"; then
      log "state reset failed for ${feature}"
      feature_failed=1
    fi
  fi

  log "running feature=${feature} suite=${suite} (timeout=${feature_timeout}s)"
  local feature_rc=0
  timeout --kill-after=30 "$feature_timeout" env \
    CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret" \
    PLAYWRIGHT_BASE_URL="$base_url" \
    PLAYWRIGHT_SKIP_WEBSERVER=1 \
    PLAYWRIGHT_HTML_OPEN=never \
    LIVE_AI_CONVERSATION_TARGET_ENV="local" \
    LIVE_COMPANY_INFO_TARGET_ENV="local" \
    CI_E2E_SCOPE="$scope" \
    bash scripts/ci/run-ai-live.sh \
      --suite "$suite" \
      --feature "$feature" \
      --output-dir "$feature_workspace" \
      --skip-summary || feature_rc=$?
  if [[ $feature_rc -ne 0 ]]; then
    if [[ $feature_rc -eq 124 ]]; then
      log "feature timed out after ${feature_timeout}s: ${feature}"
    else
      log "feature failed: ${feature} (exit=${feature_rc})"
    fi
    feature_failed=1
  fi

  feature_run_dir="$(find_feature_run_dir "$feature" || true)"

  if [[ -n "$feature_run_dir" ]]; then
    if ! copy_feature_bundle "$feature_run_dir"; then
      feature_failed=1
    fi

    if ! write_local_feature_status "$feature" "$feature_run_dir"; then
      log "status write failed for ${feature}; run-manifest.json may be missing (timeout?)"
      feature_failed=1
    fi
  else
    log "no run directory found for ${feature}"
    feature_failed=1
  fi

  return "$feature_failed"
}

generate_summary() {
  log "writing aggregate summary -> ${summary_log_path}"
  if ! node scripts/ci/write-ai-live-summary.mjs \
    --output-dir "$output_dir" \
    --suite "$suite" \
    --expected-features "$expected_features_csv" >"$summary_log_path"; then
    overall_status=1
  fi
}

case "$suite" in
  smoke|extended) ;;
  *)
    die "unsupported suite: ${suite} (expected smoke or extended)"
    ;;
esac

ensure_required_env
select_features
ensure_dir
load_snapshot_metadata

kill_stale_runs

ensure_local_database

log "never stopping unrelated dev servers: reuse healthy Next.js / FastAPI on localhost; stop them manually if you need a clean port"

next_pid=""
fastapi_pid=""
reuse_existing_next=false

if [[ -n "${AI_LIVE_LOCAL_BASE_URL:-}" ]]; then
  base_url="${AI_LIVE_LOCAL_BASE_URL%/}"
  if ! curl_http_ok "$base_url" && ! curl_http_ok "${base_url}/"; then
    die "AI_LIVE_LOCAL_BASE_URL is set but not HTTP-reachable (2xx/3xx): ${base_url}"
  fi
  if ! web_port="$(parse_localhost_port_from_base_url "$base_url")"; then
    die "AI_LIVE_LOCAL_BASE_URL must be http://localhost:PORT or http://127.0.0.1:PORT (got: ${base_url})"
  fi
  log "reusing Next.js from AI_LIVE_LOCAL_BASE_URL: ${base_url}"
  reuse_existing_next=true
else
  if existing_base="$(probe_existing_next_base_url)"; then
    base_url="$existing_base"
    web_port="$(parse_localhost_port_from_base_url "$base_url")"
    log "reusing existing Next.js on ${base_url}"
    reuse_existing_next=true
  else
    if [[ -z "$ci_e2e_auth_secret" ]]; then
      ci_e2e_auth_secret="$(generate_auth_secret)"
      log "using generated CI_E2E_AUTH_SECRET for local AI Live (this script starts Next.js)"
    else
      log "using configured CI_E2E_AUTH_SECRET for local AI Live (this script starts Next.js)"
    fi
    export CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret"
    web_port="$(select_web_port)"
    base_url="http://localhost:${web_port}"
    start_next
  fi
fi

if [[ "$reuse_existing_next" == true ]]; then
  if [[ -z "$ci_e2e_auth_secret" ]]; then
    die "reusing an existing Next.js dev server requires CI_E2E_AUTH_SECRET (e.g. in .env.local). It must match the value the running Next process loaded; restart npm run dev after changing it. To auto-generate a secret, stop dev servers on ports 3000-3010 so this script can start its own Next.js."
  fi
  export CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret"
  log "using configured CI_E2E_AUTH_SECRET for local AI Live (must match reused Next.js)"
fi

export CORS_ORIGINS="$(normalize_json_array_env "CORS_ORIGINS" "[\"${base_url}\"]")"
export BACKEND_TRUSTED_HOSTS="$(normalize_json_array_env "BACKEND_TRUSTED_HOSTS" '["localhost","127.0.0.1"]')"

if curl_http_ok "$fastapi_health_url"; then
  log "reusing existing FastAPI: ${fastapi_health_url}"
else
  start_fastapi
fi

wait_for_next
wait_for_http "FastAPI" "$fastapi_health_url"

log "running local auth preflight against ${base_url}"
env \
  CI_E2E_AUTH_SECRET="$ci_e2e_auth_secret" \
  node scripts/ci/check-ai-live-auth.mjs --base-url "$base_url" --scope "local-ai-live-${timestamp}-auth" \
  2>&1 | tee "$auth_preflight_log_path"
auth_preflight_status="passed"

log "running local principal preflight against ${base_url}"
node scripts/ci/check-ai-live-principal.mjs --base-url "$base_url" \
  2>&1 | tee "$principal_preflight_log_path"
principal_preflight_status="passed"

# Local bundle defaults to skipping ES review browser E2E, but local feature runs can enable it.
export AI_LIVE_SKIP_ES_REVIEW_PLAYWRIGHT="$skip_es_review_playwright"
if [[ "$suite" == "extended" ]]; then
  # Align with extended ES review pytest: record quality/state in JSON/MD; fail Playwright only on infra-like failures.
  export LIVE_AI_CONVERSATION_BLOCKING_FAILURES=0
  # Include last turns of failed cases in per-feature Markdown reports (bounded size).
  export LIVE_AI_CONVERSATION_MD_INCLUDE_TRANSCRIPT=1
  # Optional LLM judge (same idea as LIVE_ES_REVIEW_ENABLE_JUDGE on extended). Disable with LIVE_AI_CONVERSATION_LLM_JUDGE=0.
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    case "${LIVE_AI_CONVERSATION_LLM_JUDGE-__unset__}" in
      "0" | "false" | "FALSE") ;;
      *) export LIVE_AI_CONVERSATION_LLM_JUDGE=1 ;;
    esac
  fi
fi

run_features_parallel() {
  local max_parallel="${AI_LIVE_LOCAL_PARALLEL:-4}"
  local running_pids=()
  local running_features=()

  trim_finished_pids() {
    local alive_pids=()
    local alive_features=()
    local i
    for i in "${!running_pids[@]}"; do
      if kill -0 "${running_pids[$i]}" 2>/dev/null; then
        alive_pids+=("${running_pids[$i]}")
        alive_features+=("${running_features[$i]}")
      fi
    done
    running_pids=("${alive_pids[@]}")
    running_features=("${alive_features[@]}")
  }

  for feature in "${selected_features[@]}"; do
    while [[ ${#running_pids[@]} -ge $max_parallel ]]; do
      sleep 0.5
      trim_finished_pids
    done

    local exit_file="${feature_workspace_root}/${feature}/.exit_code"
    local log_file="${feature_workspace_root}/${feature}/feature.log"
    mkdir -p "${feature_workspace_root}/${feature}"

    (
      set +e
      run_feature_isolated "$feature" >"$log_file" 2>&1
      echo $? > "$exit_file"
    ) &
    local child_pid=$!
    running_pids+=("$child_pid")
    running_features+=("$feature")
    feature_child_pids+=("$child_pid")
  done

  wait

  for feature in "${selected_features[@]}"; do
    local exit_file="${feature_workspace_root}/${feature}/.exit_code"
    local code
    code=$(cat "$exit_file" 2>/dev/null || echo "1")
    if [[ "$code" != "0" ]]; then
      overall_status=1
      log "FAIL: ${feature}"
      tail -20 "${feature_workspace_root}/${feature}/feature.log" | sed "s/^/  [${feature}] /" >&2
    else
      log "PASS: ${feature}"
    fi
  done
}

if [[ ${#selected_features[@]} -eq 1 ]] || [[ "${AI_LIVE_LOCAL_PARALLEL:-4}" == "1" ]]; then
  for feature in "${selected_features[@]}"; do
    run_feature_isolated "$feature"
    if [[ $? -ne 0 ]]; then overall_status=1; fi
  done
else
  run_features_parallel
fi

generate_summary

log "output dir: ${output_dir}"
exit "$overall_status"
