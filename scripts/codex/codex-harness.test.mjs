import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

const repoRoot = process.cwd();

function runHook(relativePath, input) {
  return spawnSync("bash", [path.join(repoRoot, relativePath)], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
  });
}

test("codex harness docs and commands exist", () => {
  const requiredPaths = [
    ".codex/commands/reset-changes.md",
    ".codex/commands/update-docs.md",
    ".codex/commands/codex-start.md",
    ".codex/commands/codex-closeout.md",
    ".claude/commands/claude-closeout.md",
    "docs/ops/CODEX_HARNESS.md",
    ".agents/agents/README.md",
    ".codex/agents/architect.toml",
    ".codex/agents/nextjs-developer.toml",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), true, relativePath);
  }
});

test("git-push-guard blocks force push", () => {
  const result = runHook(".codex/hooks/git-push-guard.sh", JSON.stringify({
    command: "git push --force origin main",
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /force/i);
});

test("secrets-guard blocks direct secret reads", () => {
  const result = runHook(".codex/hooks/secrets-guard.sh", JSON.stringify({
    tool_name: "Read",
    file_path: "codex-company/.secrets/test.env",
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /\.secrets/);
});

test("codex-start wrapper prints codex agent specs", () => {
  const result = runHook(".codex/hooks/session-orientation.sh", "{}");

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Codex context/);
  assert.match(result.stdout, /codex agents/);
});

test("codex harness doc points to .codex agents as the runtime source", () => {
  const source = readFileSync(path.join(repoRoot, "docs/ops/CODEX_HARNESS.md"), "utf8");
  assert.match(source, /\.codex\/agents/);
  assert.match(source, /\.agents\/agents/);
  assert.match(source, /AGENTS\.md/);
});

test("codex custom agents include the required schema and skill bindings", () => {
  const agentDir = path.join(repoRoot, ".codex/agents");
  const files = readdirSync(agentDir).filter((file) => file.endsWith(".toml"));

  assert.equal(files.length, 13);

  const architect = readFileSync(path.join(agentDir, "architect.toml"), "utf8");
  assert.match(architect, /^name = "architect"/m);
  assert.match(architect, /^description = ".+"/m);
  assert.match(architect, /^developer_instructions = """/m);
  assert.match(architect, /architecture-gate/);

  const nextjs = readFileSync(path.join(agentDir, "nextjs-developer.toml"), "utf8");
  assert.match(nextjs, /nextjs-developer/);
  assert.match(nextjs, /vercel-react-best-practices/);

  const security = readFileSync(path.join(agentDir, "security-auditor.toml"), "utf8");
  assert.match(security, /better-auth-best-practices/);
  assert.match(security, /payment-integration/);
});

test("codex config aligns with the 13-agent routing and shared MCP set", () => {
  const source = readFileSync(path.join(repoRoot, ".codex/config.toml"), "utf8");

  assert.match(source, /^\[agents\]$/m);
  assert.match(source, /^max_threads = 6$/m);
  assert.match(source, /^max_depth = 1$/m);
  assert.match(source, /^\[mcp_servers\.playwright\]$/m);
  assert.match(source, /^\[mcp_servers\.notion\]$/m);

  const routingKeys = [
    "backend/app/prompts/**",
    "backend/app/utils/llm.py",
    "backend/app/routers/**",
    "backend/app/main.py",
    "backend/app/utils/llm_streaming.py",
    "src/components/**",
    "src/app/**/page.tsx",
    "src/app/**/layout.tsx",
    "src/hooks/**",
    "src/lib/db/schema.ts",
    "drizzle_pg/**",
    "src/lib/auth/**",
    "src/app/api/webhooks/stripe/**",
    "scripts/release/**",
    "e2e/**",
    "backend/tests/**",
  ];

  for (const routingKey of routingKeys) {
    assert.match(source, new RegExp(`^"${routingKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+=\\s+".+"$`, "m"));
  }
});

test("pipeline doc no longer references removed grill-me step", () => {
  const source = readFileSync(path.join(repoRoot, "docs/ops/AI_AGENT_PIPELINE.md"), "utf8");
  assert.doesNotMatch(source, /`grill-me`/);
});

test("delegate wrapper injects explicit codex harness activation guidance", () => {
  const source = readFileSync(path.join(repoRoot, "scripts/codex/delegate.sh"), "utf8");

  assert.match(source, /## Codex Harness Activation/);
  assert.match(source, /\.codex\/commands\/codex-start\.md/);
  assert.match(source, /\.codex\/agents\/\*\.toml/);
  assert.match(source, /\.codex\/skills\//);
  assert.match(source, /\.agents\/skills\//);
  assert.match(source, /architect.*first/i);
  assert.match(source, /report which agent and skills you used/i);
});

test("codex post-edit dispatcher reminds AI feature E2E once per session", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-hook-home-"));
  const input = JSON.stringify({
    session_id: "sess-1",
    tool_input: { file_path: "/Users/saoki/work/career_compass/src/app/(product)/gakuchika/[id]/page.tsx" },
  });

  const first = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/post-edit-dispatcher.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });
  const second = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/post-edit-dispatcher.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });

  assert.equal(first.status, 0);
  assert.match(first.stderr, /make test-e2e-functional-local-gakuchika/);
  assert.equal(second.status, 0);
  assert.doesNotMatch(second.stderr, /make test-e2e-functional-local-gakuchika/);
});

test("codex ui preflight hook blocks UI edits without verification state", () => {
  const verificationDir = mkdtempSync(path.join(tmpdir(), "codex-verify-"));
  const input = JSON.stringify({
    tool_input: { file_path: "/Users/saoki/work/career_compass/src/app/(product)/companies/[id]/motivation/page.tsx" },
  });

  const result = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/ui-preflight-reminder.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, AI_VERIFICATION_DIR: verificationDir },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /UI preflight is required/i);
});

test("codex ui preflight hook allows matching prepared route", () => {
  const verificationDir = mkdtempSync(path.join(tmpdir(), "codex-verify-"));
  const currentPath = path.join(verificationDir, "current.json");
  mkdirSync(verificationDir, { recursive: true });
  writeFileSync(
    currentPath,
    JSON.stringify({
      checks: [
        {
          kind: "ui:preflight",
          route: "/companies/ui-review-company/motivation",
          status: "passed",
        },
      ],
    }),
  );
  const input = JSON.stringify({
    tool_input: { file_path: "/Users/saoki/work/career_compass/src/app/(product)/companies/[id]/motivation/page.tsx" },
  });

  const result = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/ui-preflight-reminder.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, AI_VERIFICATION_DIR: verificationDir },
  });

  assert.equal(result.status, 0);
});
