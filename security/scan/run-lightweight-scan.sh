#!/bin/bash
# Lightweight security scan for pre-commit and CI.
# Runs staged Trace-core critical checks and secrets detection.
# Exit codes: 0 = no blocking findings, 1 = blocking findings, 2 = scanner error
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
FILES=$(echo "$FILES" | while IFS= read -r file; do
  [ -n "$file" ] && [ -f "$REPO_ROOT/$file" ] && printf '%s\n' "$file"
done || true)

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
TRACE_FILES=$(echo "$FILES" | grep -E '\.(ts|tsx|py|js|jsx)$' | grep -vE '^\.agents/' || true)
if [ -n "$TRACE_FILES" ]; then
  TRACE_FILE_LIST="$OUTPUT_DIR/trace-files.txt"
  printf '%s\n' "$TRACE_FILES" > "$TRACE_FILE_LIST"
  TRACE_OUTPUT=$(cd "$REPO_ROOT" && node - "$FAIL_ON" "$TRACE_LOG" "$TRACE_FILE_LIST" <<'NODE'
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const failOn = process.argv[2] || "critical";
const logPath = process.argv[3];
const fileListPath = process.argv[4];
const rank = { low: 1, medium: 2, high: 3, critical: 4 };
const threshold = rank[failOn] ?? rank.critical;
const chunkSize = 10;
const files = fs.readFileSync(fileListPath, "utf8").split(/\r?\n/u).filter(Boolean);

function isAllowedFalsePositive(item) {
  const detector = String(item.detector || "");
  const message = String(item.message || "");
  const rawCode = String(item.rawCode || "");
  if (detector !== "hallucinated-deps") {
    return false;
  }
  if (message.includes('Package "tests" not found on PyPI') && rawCode.includes("from tests.")) {
    return true;
  }
  return ["pytest", "tiktoken"].some(
    (name) => message.startsWith(`Package "${name}  #`) && rawCode.startsWith(`import ${name}  #`),
  );
}

let exitCode = 0;
let blocking = false;
let warnings = false;
let scanner = false;
fs.writeFileSync(logPath, "", "utf8");

for (let index = 0; index < files.length; index += chunkSize) {
  const chunk = files.slice(index, index + chunkSize);
  const result = spawnSync("npx", ["trace-check", "--json", `--fail-on=${failOn}`, ...chunk], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  fs.appendFileSync(logPath, output.trim() ? `${output.trim()}\n` : "", "utf8");

  if (typeof result.status === "number" && result.status > exitCode) {
    exitCode = result.status;
  }

  try {
    const payload = JSON.parse(output);
    const detections = Array.isArray(payload.detections)
      ? payload.detections.filter((item) => !isAllowedFalsePositive(item))
      : [];
    if (detections.some((item) => (rank[String(item.severity || "").toLowerCase()] ?? 0) >= threshold)) {
      blocking = true;
    } else if (detections.length > 0) {
      warnings = true;
    }
  } catch {
    if (/detection failed|fetch failed|timeout|ETIMEDOUT|ECONN|ENOTFOUND|ENOENT/i.test(output) || result.error) {
      const chunkError = {
        traceScanChunkError: true,
        status: result.status,
        signal: result.signal,
        error: result.error ? result.error.message : null,
        files: chunk,
        outputPreview: output.slice(0, 1000),
      };
      fs.appendFileSync(logPath, `${JSON.stringify(chunkError, null, 2)}\n`, "utf8");
      scanner = true;
    } else if (/"severity"\s*:\s*"critical"/i.test(output)) {
      blocking = true;
    } else if (/"severity"\s*:/i.test(output) || output.trim()) {
      warnings = true;
    } else if (result.status !== 0) {
      scanner = true;
    }
  }
}

process.stdout.write(JSON.stringify({ exitCode, blocking, warnings, scanner }));
process.exit(scanner ? 2 : blocking ? 1 : warnings ? 3 : 0);
NODE
) || TRACE_STATUS=$?
fi

if [ $TRACE_STATUS -ne 0 ]; then
  if [ $TRACE_STATUS -eq 1 ]; then
    echo "[security] Trace-core found blocking issues; details: $TRACE_LOG"
    SCAN_RESULT=1
  elif [ $TRACE_STATUS -eq 3 ]; then
    echo "[security] Trace-core found non-blocking issues below --fail-on=$FAIL_ON; details: $TRACE_LOG"
    WARNINGS=1
  else
    echo "[security] Trace-core scanner error; details: $TRACE_LOG"
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

if [ $SCANNER_ERRORS -ne 0 ]; then
  exit 2
fi

exit 0
