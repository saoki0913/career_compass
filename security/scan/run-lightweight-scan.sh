#!/bin/bash
# Lightweight security scan for pre-commit and CI.
# Runs staged Trace-core critical checks and secrets detection.
# Exit codes: 0 = clean, 1 = critical findings, 2 = scanner/warning only
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/backend/tests/output/security"
mkdir -p "$OUTPUT_DIR"

STAGED_ONLY=false
FAIL_ON="critical"
SCAN_RESULT=0
WARNINGS=0
SCANNER_ERRORS=0
TRACE_LOG="$OUTPUT_DIR/trace-core.log"
AUDIT_LOG="$OUTPUT_DIR/npm-audit.log"
SECRETS_LOG="$OUTPUT_DIR/secrets.log"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged-only) STAGED_ONLY=true; shift ;;
    --fail-on=*) FAIL_ON="${1#*=}"; shift ;;
    *) shift ;;
  esac
done

if [ "$STAGED_ONLY" = true ]; then
  FILES=$(git -C "$REPO_ROOT" diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|py|js|jsx|mjs|cjs|sh|yml|yaml|json|sql|md|mdx)$' || true)
else
  FILES=$(git -C "$REPO_ROOT" ls-files '*.ts' '*.tsx' '*.py' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.sh' '*.yml' '*.yaml' '*.json' '*.sql' '*.md' '*.mdx' || true)
fi

if [ -z "$FILES" ]; then
  echo "[security] No scannable files found."
  echo '{"status":"skipped","reason":"no_files","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' > "$OUTPUT_DIR/scan-result.json"
  exit 0
fi

echo "[security] Scanning $(echo "$FILES" | wc -l | tr -d ' ') file(s)..."

# --- 1. Trace-core: AI-generated code vulnerabilities ---
echo "[security] Running Trace-core..."
TRACE_OUTPUT=""
TRACE_STATUS=0
TRACE_FILES=$(echo "$FILES" | grep -E '\.(ts|tsx|py|js|jsx)$' || true)
if [ -n "$TRACE_FILES" ]; then
  TRACE_OUTPUT=$(cd "$REPO_ROOT" && echo "$TRACE_FILES" | xargs npx trace-check --json --fail-on="$FAIL_ON" 2>&1) || TRACE_STATUS=$?
  printf '%s\n' "$TRACE_OUTPUT" > "$TRACE_LOG"
fi

if [ $TRACE_STATUS -ne 0 ]; then
  if [ $TRACE_STATUS -eq 1 ]; then
    echo "[security] Trace-core found issues (exit=$TRACE_STATUS); details: $TRACE_LOG"
    SCAN_RESULT=1
  else
    echo "[security] Trace-core scanner error (exit=$TRACE_STATUS); details: $TRACE_LOG"
    SCANNER_ERRORS=1
  fi
fi

# --- 2. Secrets detection (patterns from secrets-guard) ---
echo "[security] Checking for hardcoded secrets..."
SECRETS_FOUND=0
SECRETS_PATTERNS='(ANTHROPIC_API_KEY|OPENAI_API_KEY|GOOGLE_API_KEY|BETTER_AUTH_SECRET|DATABASE_URL|STRIPE_SECRET_KEY|sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36})\s*[=:]\s*['\''"][^'\''"]{8,}'

SECRETS_HITS=$(cd "$REPO_ROOT" && echo "$FILES" | xargs grep -lnE "$SECRETS_PATTERNS" 2>/dev/null || true)
if [ -n "$SECRETS_HITS" ]; then
  printf '%s\n' "$SECRETS_HITS" > "$SECRETS_LOG"
  echo "[security] Potential secrets found in:"
  echo "$SECRETS_HITS" | sed 's/^/  /'
  SECRETS_FOUND=1
  SCAN_RESULT=1
fi

# --- 3. npm audit (opt-in; dependency-tree wide and network dependent) ---
AUDIT_STATUS=0
if [ "${SECURITY_SCAN_INCLUDE_AUDIT:-0}" = "1" ]; then
  echo "[security] Running npm audit..."
  (cd "$REPO_ROOT" && npm audit --omit=dev --audit-level=critical > "$AUDIT_LOG" 2>&1) || AUDIT_STATUS=$?
  if [ $AUDIT_STATUS -ne 0 ]; then
    echo "[security] npm audit found critical vulnerabilities; details: $AUDIT_LOG"
    SCAN_RESULT=1
  fi
else
  echo "[security] Skipping npm audit in lightweight scan (set SECURITY_SCAN_INCLUDE_AUDIT=1 to enable)."
fi

# --- Write result ---
FINAL_STATUS="clean"
if [ $SCAN_RESULT -ne 0 ]; then
  FINAL_STATUS="critical"
elif [ $SCANNER_ERRORS -ne 0 ]; then
  FINAL_STATUS="scanner_error"
elif [ $WARNINGS -ne 0 ]; then
  FINAL_STATUS="warnings"
fi

cat > "$OUTPUT_DIR/scan-result.json" <<RESULT_EOF
{
  "status": "$FINAL_STATUS",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tracecore": {"exitCode": $TRACE_STATUS, "failOn": "$FAIL_ON", "log": "$TRACE_LOG"},
  "secrets": {"found": $SECRETS_FOUND},
  "scannerErrors": $SCANNER_ERRORS,
  "npmAudit": {"enabled": $([ "${SECURITY_SCAN_INCLUDE_AUDIT:-0}" = "1" ] && echo true || echo false), "criticalExitCode": $AUDIT_STATUS}
}
RESULT_EOF

echo "[security] Scan complete: $FINAL_STATUS"

if [ $SCAN_RESULT -ne 0 ]; then
  echo "[security] Critical findings detected. See $OUTPUT_DIR/scan-result.json"
  exit 1
fi

if [ $WARNINGS -ne 0 ]; then
  exit 2
fi

if [ $SCANNER_ERRORS -ne 0 ]; then
  exit 2
fi

exit 0
