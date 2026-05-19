import { chmodSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";

const repoRoot = process.cwd();
const runner = path.join(repoRoot, "scripts/harness/run-with-local-service-env.mjs");

function run(args, options = {}) {
  return spawnSync("node", [runner, ...args], {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
}

test("local service env runner redacts allowlisted values from child output", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "service-env-sentry-"));
  const safeBin = path.join(tempRoot, "tools/cli-safe/bin");
  const scriptPath = path.join(safeBin, "sentry");
  mkdirSync(safeBin, { recursive: true });
  const secret = "sntrys_secretvalueforredaction123456";
  writeFileSync(scriptPath, [
    "#!/usr/bin/env node",
    "if (process.env.STRIPE_SECRET_KEY) process.exit(3);",
    "process.stdout.write(process.env.SENTRY_AUTH_TOKEN);",
  ].join("\n"));
  chmodSync(scriptPath, 0o755);

  const result = run([
    "--profile",
    "sentry-read",
    "--",
    "sentry",
    "issues",
    "list",
  ], {
    cwd: tempRoot,
    env: {
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ""}`,
      SENTRY_AUTH_TOKEN: secret,
      SENTRY_ORG: "org",
      SENTRY_PROJECT: "project",
      STRIPE_SECRET_KEY: "sk_test_should_not_be_forwarded",
    },
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("local service env runner rejects executable paths even if basename is allowlisted", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "service-env-path-"));
  mkdirSync(path.join(tempRoot, "tools/cli-safe/bin"), { recursive: true });
  const fakeSentry = path.join(tempRoot, "sentry");
  const secret = "sntrys_secretvalueforredaction123456";
  writeFileSync(fakeSentry, [
    "#!/usr/bin/env node",
    "process.stdout.write(process.env.SENTRY_AUTH_TOKEN || '');",
  ].join("\n"));
  chmodSync(fakeSentry, 0o755);

  const result = run([
    "--profile",
    "sentry-read",
    "--",
    fakeSentry,
    "issues",
    "list",
  ], { cwd: tempRoot, env: { SENTRY_AUTH_TOKEN: secret } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not allowed/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("local service env runner rejects untrusted sentry_api.py paths", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "service-env-fake-sentry-api-"));
  mkdirSync(path.join(tempRoot, "plugins/sentry/skills/sentry/scripts"), { recursive: true });
  mkdirSync(path.join(tempRoot, "tools/cli-safe/bin"), { recursive: true });
  const fakeApi = path.join(tempRoot, "plugins/sentry/skills/sentry/scripts/sentry_api.py");
  const secret = "sntrys_secretvalueforredaction123456";
  writeFileSync(fakeApi, [
    "import os",
    "import sys",
    "sys.stdout.write(os.environ.get('SENTRY_AUTH_TOKEN', ''))",
  ].join("\n"));

  const result = run([
    "--profile",
    "sentry-read",
    "--",
    "python3",
    fakeApi,
    "list-issues",
  ], {
    cwd: tempRoot,
    env: {
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ""}`,
      SENTRY_AUTH_TOKEN: secret,
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not allowed/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
});

test("local service env runner rejects env dumping commands", () => {
  const result = run(["--profile", "sentry-read", "--", "printenv"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not allowed/);
});

test("local service env runner rejects non-profile commands", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "service-env-deny-"));
  mkdirSync(path.join(tempRoot, "tools/cli-safe/bin"), { recursive: true });

  const result = run([
    "--profile",
    "sentry-read",
    "--",
    process.execPath,
    "-e",
    "process.stdout.write(process.env.SENTRY_AUTH_TOKEN || '')",
  ], { cwd: tempRoot, env: { SENTRY_AUTH_TOKEN: "sntrys_secretvalueforredaction123456" } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not allowed/);
  assert.doesNotMatch(result.stdout + result.stderr, /sntrys_secretvalueforredaction/);
});

test("local service env runner allows direct read-only Stripe scripts but rejects npm wrappers", () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "service-env-stripe-"));
  mkdirSync(path.join(tempRoot, "scripts/stripe"), { recursive: true });
  mkdirSync(path.join(tempRoot, "tools/cli-safe/bin"), { recursive: true });
  const secret = "sk_test_secretvalueforredaction123456";
  writeFileSync(path.join(tempRoot, "scripts/stripe/inspect.mjs"), [
    "if (process.env.SENTRY_AUTH_TOKEN) process.exit(4);",
    "process.stdout.write(process.env.STRIPE_SECRET_KEY);",
  ].join("\n"));

  const direct = run([
    "--profile",
    "stripe-read",
    "--",
    "node",
    "scripts/stripe/inspect.mjs",
  ], {
    cwd: tempRoot,
    env: {
      STRIPE_SECRET_KEY: secret,
      SENTRY_AUTH_TOKEN: "sntrys_should_not_be_forwarded123456",
    },
  });

  assert.equal(direct.status, 0);
  assert.match(direct.stdout, /\[REDACTED\]/);
  assert.doesNotMatch(direct.stdout + direct.stderr, new RegExp(secret));

  const npmWrapped = run(["--profile", "stripe-read", "--", "npm", "run", "stripe:inspect"], { cwd: tempRoot });
  assert.equal(npmWrapped.status, 1);
  assert.match(npmWrapped.stderr, /not allowed/);
});

test("local service env runner rejects mutating gh api method flags", () => {
  for (const methodFlag of ["-XPOST", "--method=POST", "-f", "--field=name=value", "-F", "--raw-field=name=value", "--show-token"]) {
    const result = run(["--profile", "github-read", "--", "gh", "api", methodFlag, "/repos/example/repo"]);

    assert.equal(result.status, 1, methodFlag);
    assert.match(result.stderr, /not allowed/, methodFlag);
  }
});

test("local service env runner rejects gh api because it is not read-only enough", () => {
  const result = run(["--profile", "github-read", "--", "gh", "api", "/repos/example/repo"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not allowed/);
});

test("local service env runner rejects gh auth token display", () => {
  const result = run(["--profile", "github-read", "--", "gh", "auth", "status", "--show-token"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /not allowed/);
});
