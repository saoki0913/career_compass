import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
