import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = "/Users/saoki/work/career_compass";
const scriptPath = path.join(repoRoot, "scripts/release/sync-career-compass-secrets.sh");

test("checks env files with spaces and emails without sourcing them", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));

  try {
    writeFileSync(
      path.join(secretDir, "vercel-staging.env"),
      [
        "VERCEL_PROJECT_ID=prj_test123",
        "VERCEL_TEAM_ID=team_test123",
        "CONTACT_TO_EMAIL=support@shupass.jp",
        "CONTACT_FROM_EMAIL=support@shupass.jp",
        "LEGAL_SUPPORT_EMAIL=support@shupass.jp",
        "LEGAL_DISCLOSURE_REQUEST_EMAIL=support@shupass.jp",
        "LEGAL_DISCLOSURE_REQUEST_NOTICE=販売事業者、運営責任者、所在地、電話番号は、請求があった場合に遅滞なく開示いたします。開示をご希望の方は support@shupass.jp までご連絡ください。",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = spawnSync(
      "zsh",
      [scriptPath, "--check", "--target", "vercel-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Checked Vercel staging env/);
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
  }
});

test("applies Railway variables via stdin so JSON values keep their quotes", () => {
  const secretDir = mkdtempSync(path.join(tmpdir(), "career-compass-secrets-"));
  const binDir = mkdtempSync(path.join(tmpdir(), "career-compass-bin-"));
  const argsLog = path.join(secretDir, "railway-args.log");
  const stdinLog = path.join(secretDir, "railway-stdin.log");

  try {
    writeFileSync(
      path.join(secretDir, "railway-staging.env"),
      [
        "RAILWAY_PROJECT_ID=project_test123",
        "RAILWAY_SERVICE_NAME=career-compass-backend-staging",
        "RAILWAY_ENVIRONMENT_NAME=production",
        'BACKEND_TRUSTED_HOSTS=["stg-api.shupass.jp","localhost"]',
        "INTERNAL_API_JWT_SECRET=test-secret",
        "",
      ].join("\n"),
      "utf8",
    );

    const fakeRailwayPath = path.join(binDir, "railway");
    writeFileSync(
      fakeRailwayPath,
      `#!/bin/zsh
set -euo pipefail

print -r -- "$*" >> "$RAILWAY_ARGS_LOG"

if [[ "$1" == "variable" && "$2" == "set" && "$*" == *"BACKEND_TRUSTED_HOSTS"* && "$*" == *"--stdin"* ]]; then
  cat > "$RAILWAY_STDIN_LOG"
fi
`,
      "utf8",
    );
    chmodSync(fakeRailwayPath, 0o755);

    const result = spawnSync(
      "zsh",
      [scriptPath, "--apply", "--target", "railway-staging", "--secret-dir", secretDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          RAILWAY_ARGS_LOG: argsLog,
          RAILWAY_STDIN_LOG: stdinLog,
        },
      },
    );

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const args = readFileSync(argsLog, "utf8");
    assert.match(args, /link --project project_test123 --service career-compass-backend-staging --environment production --json/);
    assert.match(args, /variable set BACKEND_TRUSTED_HOSTS .*--stdin/);

    const stdinValue = readFileSync(stdinLog, "utf8").trim();
    assert.equal(stdinValue, '["stg-api.shupass.jp","localhost"]');
  } finally {
    rmSync(secretDir, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
