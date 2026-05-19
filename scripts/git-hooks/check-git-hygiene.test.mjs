import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { evaluateFiles } from "./check-git-hygiene.mjs";

function tempRepo() {
  return mkdtempSync(path.join(tmpdir(), "git-hygiene-"));
}

function writeFixture(root, filePath, content = "") {
  const fullPath = path.join(root, filePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("blocks runtime and generated artifact paths", async () => {
  const findings = await evaluateFiles([
    "backend/.ai/verification/current.json",
    "product/.ai/verification/current.json",
    "docs/ops/agent-usage.log",
    "output/playwright/home.png",
    "public/screenshots/generated/product/product.dashboard/desktop.png",
    "public/marketing/LP/assets/_archive/metadata/manifest.txt",
    "public/marketing/LP/section_image/asset/hero/card.png",
  ]);

  assert.deepEqual(
    findings.map((finding) => finding.file),
    [
      "backend/.ai/verification/current.json",
      "product/.ai/verification/current.json",
      "docs/ops/agent-usage.log",
      "output/playwright/home.png",
      "public/screenshots/generated/product/product.dashboard/desktop.png",
      "public/marketing/LP/assets/_archive/metadata/manifest.txt",
      "public/marketing/LP/section_image/asset/hero/card.png",
    ],
  );
});

test("allows curated public marketing assets and app icons", async () => {
  const findings = await evaluateFiles([
    "public/icon.png",
    "public/marketing/LP/assets/characters/student.png",
    "public/marketing/LP/seo-lp-hero/shukatsu-ai.png",
    "public/marketing/LP/screenshots/hero-dashboard.png",
    "public/marketing/LP/section_image/example.png",
  ]);

  assert.deepEqual(findings, []);
});

test("blocks large images outside the asset allowlist", async () => {
  const root = tempRepo();
  writeFixture(root, "docs/images/debug.png", Buffer.alloc(600 * 1024));

  const findings = await evaluateFiles(["docs/images/debug.png"], { cwd: root });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, "docs/images/debug.png");
  assert.match(findings[0].reason, /large image/u);
});

test("blocks env, secret, browser auth, and session state files", async () => {
  const root = tempRepo();
  writeFixture(root, "tmp/state.json", '{"sessionId":"abc"}');

  const findings = await evaluateFiles(
    [".env.local", ".secrets/prod.env", "playwright/.auth/storageState.json", "tmp/state.json"],
    { cwd: root },
  );

  assert.deepEqual(
    findings.map((finding) => finding.file),
    [".env.local", ".secrets/prod.env", "playwright/.auth/storageState.json", "tmp/state.json"],
  );
});

test("allows source files that implement auth state handling", async () => {
  const findings = await evaluateFiles([
    "tools/save-playwright-auth-state.mjs",
    "scripts/release/capture-google-storage-state.sh",
  ]);

  assert.deepEqual(findings, []);
});

test("uses the staged blob when source is index", async () => {
  const root = tempRepo();
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test User"]);
  writeFixture(root, "docs/images/debug.png", Buffer.alloc(600 * 1024));
  writeFixture(root, "tmp/state.json", '{"sessionId":"abc"}');
  git(root, ["add", "docs/images/debug.png", "tmp/state.json"]);
  writeFixture(root, "docs/images/debug.png", Buffer.alloc(1));
  writeFixture(root, "tmp/state.json", "{}");

  const findings = await evaluateFiles(["docs/images/debug.png", "tmp/state.json"], {
    cwd: root,
    source: "index",
  });

  assert.deepEqual(
    findings.map((finding) => finding.file),
    ["docs/images/debug.png", "tmp/state.json"],
  );
});
