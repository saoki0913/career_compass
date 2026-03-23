#!/bin/zsh

set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

environment="${1:-}"
output_file="${2:-}"
[[ -n "$environment" ]] || {
  echo "Usage: $0 <staging|production> [output_file]" >&2
  exit 1
}

case "$environment" in
  staging)
    base_url="https://stg.shupass.jp"
    ;;
  production)
    base_url="https://www.shupass.jp"
    ;;
  *)
    echo "Unsupported environment: ${environment}" >&2
    exit 1
    ;;
esac

chrome_user_data_dir="${CODEX_CHROME_USER_DATA_DIR:-$HOME/Library/Application Support/Google/Chrome}"
local_state_file="${chrome_user_data_dir}/Local State"
[[ -f "${local_state_file}" ]] || {
  echo "Missing Chrome Local State: ${local_state_file}" >&2
  exit 1
}

profile_name="${CODEX_CHROME_PROFILE:-$(CODEX_CHROME_USER_DATA_DIR="${chrome_user_data_dir}" python3 - <<'PY'
import json, os
path=os.path.join(os.environ["CODEX_CHROME_USER_DATA_DIR"], "Local State")
with open(path) as f:
    data=json.load(f)
print(data.get("profile", {}).get("last_used") or "Default")
PY
)}"

profile_dir="${chrome_user_data_dir}/${profile_name}"
[[ -d "${profile_dir}" ]] || {
  echo "Missing Chrome profile directory: ${profile_dir}" >&2
  exit 1
}

test_dir="${repo_root}/e2e"
temp_user_data="$(mktemp -d /tmp/career-compass-chrome.XXXXXX)"
temp_state="${output_file:-$(mktemp /tmp/career-compass-${environment}-auth.XXXXXX.json)}"
temp_spec_base="$(mktemp "${test_dir}/codex-capture-google.XXXXXX")"
temp_spec="${temp_spec_base}.spec.ts"
mv "${temp_spec_base}" "${temp_spec}"

cleanup() {
  rm -f "${temp_spec}"
  rm -rf "${temp_user_data}"
}
trap cleanup EXIT

cp "${local_state_file}" "${temp_user_data}/Local State"
cp -R "${profile_dir}" "${temp_user_data}/${profile_name}"
rm -f "${temp_user_data}/SingletonLock" \
  "${temp_user_data}/SingletonCookie" \
  "${temp_user_data}/SingletonSocket" \
  "${temp_user_data}/DevToolsActivePort" \
  "${temp_user_data}/${profile_name}/Lockfile" \
  "${temp_user_data}/${profile_name}/DevToolsActivePort"

cat > "${temp_spec}" <<'EOF'
import { test, expect } from "@playwright/test";
import { chromium } from "playwright";
import fs from "node:fs";

const baseUrl = process.env.PLAYWRIGHT_CAPTURE_BASE_URL!;
const capturePath = process.env.PLAYWRIGHT_CAPTURE_PATH!;
const userDataDir = process.env.PLAYWRIGHT_CAPTURE_USER_DATA_DIR!;
const profileDir = process.env.PLAYWRIGHT_CAPTURE_PROFILE_DIR!;

test("capture auth state from existing Chrome session", async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: process.env.CODEX_HEADFUL_CAPTURE === "1" ? false : true,
    args: [`--profile-directory=${profileDir}`],
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(new URL("/dashboard", baseUrl).toString(), { waitUntil: "networkidle" });
    await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 90000 });
    await context.storageState({ path: capturePath });
    expect(fs.existsSync(capturePath)).toBeTruthy();
  } finally {
    await context.close();
  }
});
EOF

(
  cd "${repo_root}"
  PLAYWRIGHT_CAPTURE_BASE_URL="${base_url}" \
    PLAYWRIGHT_CAPTURE_PATH="${temp_state}" \
    PLAYWRIGHT_CAPTURE_USER_DATA_DIR="${temp_user_data}" \
    PLAYWRIGHT_CAPTURE_PROFILE_DIR="${profile_name}" \
    PLAYWRIGHT_SKIP_WEBSERVER=1 \
    npm run test:e2e -- "${temp_spec}"
)

printf '%s\n' "${temp_state}"
