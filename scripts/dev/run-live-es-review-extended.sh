#!/usr/bin/env bash
# Flexible live ES review runner (real APIs). Loads .env.local like Makefile backend-test-live-es-review.
#
# Examples:
#   ./scripts/dev/run-live-es-review-extended.sh --run 5 --model claude
#   ./scripts/dev/run-live-es-review-extended.sh --run 1 --model gpt-5.4-mini,gemini
#   ./scripts/dev/run-live-es-review-extended.sh --run 1 --model gpt-5.4-mini,gemini --model gpt-5.4
#   ./scripts/dev/run-live-es-review-extended.sh --case-set smoke --model all --no-aggregate
#
# Model aliases (comma-separated ok): claude|sonnet, gemini, mini|gpt-mini, gpt|gpt54, all (4-model default)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

RUNS=1
MODEL_ARG=""
CASE_SET="extended"
COLLECT_ONLY=1
AGGREGATE=1
JUDGE_MODE="default"
REQUIRE_JUDGE_PASS=""
OUT_DIR_OVERRIDE=""
BATCH_TS=""
SHOW_PROGRESS=1

usage() {
  cat <<'EOF'
Flexible live ES review (real APIs). Loads .env.local via npx dotenv.

Examples:
  ./scripts/dev/run-live-es-review-extended.sh --run 5 --model claude
  ./scripts/dev/run-live-es-review-extended.sh --run 1 --model gpt-5.4-mini,gemini
  ./scripts/dev/run-live-es-review-extended.sh --run 1 --model "gpt-5.4-mini,gemini,gpt-5.4"
  ./scripts/dev/run-live-es-review-extended.sh --case-set smoke --model all --no-aggregate

Options:
  --run N              Repeat pytest N times (default: 1)
  --model LIST         Comma-separated models or aliases; repeat flag to append (default: unset = case-set defaults)
                         Quote if the list might split on spaces: --model "a,b,c"
  --case-set NAME      smoke | extended | canary (default: extended)
  --output-dir PATH    LIVE_ES_REVIEW_OUTPUT_DIR (default: backend/tests/output/live_extended_batch_<UTC>)
  --batch-ts TOKEN     Fixed subdirectory token instead of auto UTC timestamp
  --no-collect-only    Fail pytest when gate failures occur (strict)
  --no-aggregate       Skip aggregate_live_es_review_runs.py at the end
  --no-judge           LIVE_ES_REVIEW_ENABLE_JUDGE=0
  --judge              LIVE_ES_REVIEW_ENABLE_JUDGE=1
  --require-judge-pass LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS=1
  --no-progress        Disable per-case stderr progress (LIVE_ES_REVIEW_CLI_PROGRESS=0)
  -h, --help           This help

Environment overrides (optional): LIVE_ES_REVIEW_CASE_FILTER, LIVE_ES_REVIEW_JUDGE_MODEL, etc.
EOF
}

normalize_model() {
  local t
  t=$(echo "$1" | tr '[:upper:]' '[:lower:]' | xargs)
  case "$t" in
    claude | sonnet | anthropic) echo "claude-sonnet" ;;
    gemini | google) echo "gemini-3.1-pro-preview" ;;
    mini | gpt-mini | gpt5-mini) echo "gpt-5.4-mini" ;;
    gpt | gpt54 | gpt5) echo "gpt-5.4" ;;
    all) echo "__USE_DEFAULT_MODELS__" ;;
    "") echo "" ;;
    *) echo "$1" | xargs ;;
  esac
}

build_providers_csv() {
  local raw="$1"
  local out="" tok norm
  if [[ -z "$raw" || "$raw" == "all" ]]; then
    echo "__USE_DEFAULT_MODELS__"
    return
  fi
  IFS=',' read -r -a _parts <<< "$raw"
  for tok in "${_parts[@]}"; do
    tok=$(echo "$tok" | xargs)
    [[ -z "$tok" ]] && continue
    norm=$(normalize_model "$tok")
    if [[ "$norm" == "__USE_DEFAULT_MODELS__" ]]; then
      echo "__USE_DEFAULT_MODELS__"
      return
    fi
    if [[ -z "$out" ]]; then
      out="$norm"
    else
      out="$out,$norm"
    fi
  done
  echo "$out"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run)
      RUNS="$2"
      shift 2
      ;;
    --model)
      if [[ -z "$MODEL_ARG" ]]; then
        MODEL_ARG="$2"
      else
        MODEL_ARG="$MODEL_ARG,$2"
      fi
      shift 2
      ;;
    --case-set)
      CASE_SET="$2"
      shift 2
      ;;
    --output-dir)
      OUT_DIR_OVERRIDE="$2"
      shift 2
      ;;
    --batch-ts)
      BATCH_TS="$2"
      shift 2
      ;;
    --no-collect-only)
      COLLECT_ONLY=0
      shift
      ;;
    --no-aggregate)
      AGGREGATE=0
      shift
      ;;
    --no-judge)
      JUDGE_MODE="off"
      shift
      ;;
    --judge)
      JUDGE_MODE="on"
      shift
      ;;
    --require-judge-pass)
      REQUIRE_JUDGE_PASS=1
      shift
      ;;
    --no-progress)
      SHOW_PROGRESS=0
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! [[ "$RUNS" =~ ^[1-9][0-9]*$ ]]; then
  echo "--run must be a positive integer" >&2
  exit 1
fi

BATCH_TS="${BATCH_TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
if [[ -n "$OUT_DIR_OVERRIDE" ]]; then
  OUT_SUBDIR="$OUT_DIR_OVERRIDE"
else
  OUT_SUBDIR="backend/tests/output/live_extended_batch_${BATCH_TS}"
fi
mkdir -p "$OUT_SUBDIR"

export RUN_LIVE_ES_REVIEW=1
export LIVE_ES_REVIEW_COLLECT_ONLY="$COLLECT_ONLY"
export LIVE_ES_REVIEW_FAIL_ON_MISSING_KEYS=0
export LIVE_ES_REVIEW_CAPTURE_DEBUG=1
export LIVE_ES_REVIEW_OUTPUT_DIR="$OUT_SUBDIR"
export LIVE_ES_REVIEW_CASE_SET="$CASE_SET"

if [[ "$JUDGE_MODE" == "on" ]]; then
  export LIVE_ES_REVIEW_ENABLE_JUDGE=1
elif [[ "$JUDGE_MODE" == "off" ]]; then
  export LIVE_ES_REVIEW_ENABLE_JUDGE=0
else
  unset LIVE_ES_REVIEW_ENABLE_JUDGE
fi

if [[ -n "$REQUIRE_JUDGE_PASS" ]]; then
  export LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS="$REQUIRE_JUDGE_PASS"
else
  unset LIVE_ES_REVIEW_REQUIRE_JUDGE_PASS
fi

_resolved=$(build_providers_csv "${MODEL_ARG:-}")
if [[ "$_resolved" == "__USE_DEFAULT_MODELS__" ]]; then
  unset LIVE_ES_REVIEW_PROVIDERS
else
  export LIVE_ES_REVIEW_PROVIDERS="$_resolved"
fi

if [[ "$SHOW_PROGRESS" == 1 ]]; then
  export LIVE_ES_REVIEW_CLI_PROGRESS=1
else
  unset LIVE_ES_REVIEW_CLI_PROGRESS
fi

PYTEST=(npx dotenv -e .env.local -- python -m pytest
  backend/tests/es_review/integration/test_live_es_review_provider_report.py
  -m integration --tb=short -s)

echo "==> live ES review"
echo "    case_set=$CASE_SET  runs=$RUNS  out=$OUT_SUBDIR"
if [[ -n "${LIVE_ES_REVIEW_PROVIDERS:-}" ]]; then
  echo "    providers=$LIVE_ES_REVIEW_PROVIDERS"
else
  echo "    providers=(default for case_set)"
fi
echo "    collect_only=$COLLECT_ONLY  aggregate=$AGGREGATE  cli_progress=$SHOW_PROGRESS"
echo

for ((i = 1; i <= RUNS; i++)); do
  export LIVE_ES_REVIEW_CLI_ROUND="${i}/${RUNS}"
  echo "------------------------------------------------------------------"
  echo "=== Round ${LIVE_ES_REVIEW_CLI_ROUND} (pytest) ==="
  echo "------------------------------------------------------------------"
  "${PYTEST[@]}"
done

if [[ "$AGGREGATE" == 1 ]]; then
  echo
  echo "=== aggregate (this batch directory) ==="
  _jsons=()
  while IFS= read -r _line; do
    [[ -n "$_line" ]] && _jsons+=("$_line")
  done < <(find "$OUT_SUBDIR" -maxdepth 1 -name "live_es_review_${CASE_SET}_*.json" -type f | LC_ALL=C sort)
  if [[ ${#_jsons[@]} -eq 0 ]]; then
    echo "No live_es_review_${CASE_SET}_*.json under ${OUT_SUBDIR}" >&2
    exit 1
  fi
  python scripts/dev/aggregate_live_es_review_runs.py "${_jsons[@]}"
  echo "Aggregate written under backend/tests/output/live_es_review_aggregate_*"
fi

echo
echo "Done. Batch dir: ${OUT_SUBDIR}"
