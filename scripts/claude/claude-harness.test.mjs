import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();

function runHook(relativePath, input) {
  return spawnSync("bash", [path.join(repoRoot, relativePath)], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
  });
}

test("claude settings define shared policy and new hook events", () => {
  const settings = JSON.parse(readFileSync(path.join(repoRoot, ".claude/settings.json"), "utf8"));

  assert.ok(settings.hooks?.PreToolUse);
  assert.ok(settings.hooks?.PostToolUse);
  assert.ok(settings.hooks?.SessionStart);
  assert.ok(settings.hooks?.UserPromptSubmit);
  assert.ok(settings.hooks?.PermissionRequest);
  assert.ok(settings.hooks?.PostToolUseFailure);
});

test("claude harness scripts and docs exist", () => {
  const requiredPaths = [
    ".claude/statusline.sh",
    ".claude/hooks/user-prompt-submit-router.sh",
    ".claude/hooks/permission-request-guard.sh",
    ".claude/hooks/post-tool-failure-triage.sh",
    "docs/ops/AI_HARNESS.md",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), true, relativePath);
  }
});

test("user-prompt-submit-router returns prompt-engineer hint", () => {
  const result = runHook(
    ".claude/hooks/user-prompt-submit-router.sh",
    JSON.stringify({ prompt: "ES 添削のプロンプトを改善したい" }),
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /prompt-engineer/);
});

test("permission-request-guard denies force push", () => {
  const result = runHook(
    ".claude/hooks/permission-request-guard.sh",
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" },
    }),
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.decision.behavior, "deny");
  assert.match(output.hookSpecificOutput.decision.message, /force/i);
});

test("post-tool-failure-triage suggests escalation for sandbox failures", () => {
  const result = runHook(
    ".claude/hooks/post-tool-failure-triage.sh",
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "npm install" },
      error: "operation not permitted",
    }),
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /escalated permissions/i);
});

test("statusline renders git and cost context", () => {
  const result = runHook(
    ".claude/statusline.sh",
    JSON.stringify({
      model: { display_name: "claude-test" },
      workspace: { current_dir: repoRoot },
      context_window: { used_percentage: 42 },
      cost: { total_cost_usd: 1.23, total_duration_ms: 654321 },
    }),
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /\[claude-test\]/);
  assert.match(result.stdout, /ctx:42%/);
  assert.match(result.stdout, /cost:\$1\.23/);
});
