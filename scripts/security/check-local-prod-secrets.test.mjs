import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const script = join(repoRoot, "scripts/security/check-local-prod-secrets.mjs");

function runWithContent(content) {
  const dir = mkdtempSync(join(tmpdir(), "prod-secret-scan-"));
  const file = join(dir, "fixture.env.example");
  writeFileSync(file, content, "utf8");
  try {
    return spawnSync("node", [script, relative(repoRoot, file)], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("allows documented placeholders", () => {
  const result = runWithContent(`
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
`);

  assert.equal(result.status, 0);
});

test("blocks production-like secret values", () => {
  const stripeSecret = "sk_live_" + "1234567890abcdefghijkl";
  const webhookSecret = "whsec_" + "1234567890abcdefghijkl";
  const databaseUrl =
    "postgresql://postgres.real:real-password@aws-1-ap-south-1." +
    "pooler.supabase.com:6543/postgres";
  const result = runWithContent(`
STRIPE_SECRET_KEY=${stripeSecret}
STRIPE_WEBHOOK_SECRET=${webhookSecret}
DATABASE_URL=${databaseUrl}
`);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /stripe_live_secret/u);
  assert.match(result.stderr, /production_database_url/u);
  assert.doesNotMatch(result.stderr, /1234567890abcdefghijkl/u);
});

test("scans an explicit file list", () => {
  const dir = mkdtempSync(join(tmpdir(), "prod-secret-scan-list-"));
  const fixture = join(dir, "fixture.ts");
  const list = join(dir, "files.txt");
  const anthropicSecret = "sk-ant-" + "1234567890abcdefghijkl";
  writeFileSync(fixture, `const key = "${anthropicSecret}";\n`, "utf8");
  writeFileSync(list, `${relative(repoRoot, fixture)}\n`, "utf8");
  try {
    const result = spawnSync("node", [script, "--file-list", list], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /anthropic_secret/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
