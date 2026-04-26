import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

test("claude settings define shared policy and new hook events", () => {
  const settings = JSON.parse(readFileSync(path.join(repoRoot, ".claude/settings.json"), "utf8"));

  assert.ok(settings.hooks?.PreToolUse);
  assert.ok(settings.hooks?.PostToolUse);
  assert.ok(settings.hooks?.SessionStart);
  assert.ok(settings.hooks?.UserPromptSubmit);
  assert.ok(settings.hooks?.PermissionRequest);
  assert.ok(settings.hooks?.PostToolUseFailure);
  assert.equal(settings.env?.BASH_DEFAULT_TIMEOUT_MS, "3600000");
  assert.equal(settings.env?.BASH_MAX_TIMEOUT_MS, "7200000");
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

test("pre-tool dispatcher keeps harmless bash commands quiet", () => {
  const result = runHook(
    ".claude/hooks/pre-tool-dispatcher.sh",
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "git status" },
    }),
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("pre-tool dispatcher still blocks force push", () => {
  const result = runHook(
    ".claude/hooks/pre-tool-dispatcher.sh",
    JSON.stringify({
      tool_name: "Bash",
      tool_input: { command: "git push --force origin main" },
    }),
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /force/i);
});

test("tdd guard records test edits before implementation edits", () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "claude-tdd-project-"));
  const homeDir = mkdtempSync(path.join(tmpdir(), "claude-tdd-home-"));
  const sourceDir = path.join(projectDir, "src/lib/stripe");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(sourceDir, "config.test.ts"), "export {};\n");
  writeFileSync(path.join(sourceDir, "config.ts"), "export {};\n");

  const env = { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectDir };
  const testEdit = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/tdd-enforcement-guard.sh")], {
    cwd: projectDir,
    input: JSON.stringify({
      session_id: "sess-tdd",
      tool_input: { file_path: path.join(sourceDir, "config.test.ts") },
    }),
    encoding: "utf8",
    env,
  });
  const implementationEdit = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/tdd-enforcement-guard.sh")], {
    cwd: projectDir,
    input: JSON.stringify({
      session_id: "sess-tdd",
      tool_input: { file_path: path.join(sourceDir, "config.ts") },
    }),
    encoding: "utf8",
    env,
  });

  assert.equal(testEdit.status, 0);
  assert.equal(implementationEdit.status, 0);
});

test("tdd guard blocks implementation edits without a prior test edit", () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "claude-tdd-project-"));
  const homeDir = mkdtempSync(path.join(tmpdir(), "claude-tdd-home-"));
  const sourceDir = path.join(projectDir, "src/lib/stripe");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(sourceDir, "config.test.ts"), "export {};\n");
  writeFileSync(path.join(sourceDir, "config.ts"), "export {};\n");

  const result = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/tdd-enforcement-guard.sh")], {
    cwd: projectDir,
    input: JSON.stringify({
      session_id: "sess-tdd",
      tool_input: { file_path: path.join(sourceDir, "config.ts") },
    }),
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectDir },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /未更新/);
});

test("tdd guard blocks implementation edits when the test file is missing", () => {
  const projectDir = mkdtempSync(path.join(tmpdir(), "claude-tdd-project-"));
  const homeDir = mkdtempSync(path.join(tmpdir(), "claude-tdd-home-"));
  const sourceDir = path.join(projectDir, "src/lib/stripe");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(path.join(sourceDir, "config.ts"), "export {};\n");

  const result = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/tdd-enforcement-guard.sh")], {
    cwd: projectDir,
    input: JSON.stringify({
      session_id: "sess-tdd",
      tool_input: { file_path: path.join(sourceDir, "config.ts") },
    }),
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir, CLAUDE_PROJECT_DIR: projectDir },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /テストファイルが見つかりません/);
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

test("claude post-edit dispatcher reminds AI feature E2E once per session", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "claude-hook-home-"));
  const input = JSON.stringify({
    session_id: "sess-1",
    tool_input: { file_path: "/Users/saoki/work/career_compass/backend/app/routers/es_review.py" },
  });

  const first = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/post-edit-dispatcher.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });
  const second = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/post-edit-dispatcher.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });

  assert.equal(first.status, 0);
  assert.match(first.stderr, /make test-e2e-functional-local-es/);
  assert.equal(second.status, 0);
  assert.doesNotMatch(second.stderr, /make test-e2e-functional-local-es/);
});

test("claude ui preflight hook blocks UI edits without verification state", () => {
  const verificationDir = mkdtempSync(path.join(tmpdir(), "claude-verify-"));
  const input = JSON.stringify({
    tool_input: { file_path: "/Users/saoki/work/career_compass/src/app/(product)/companies/[id]/motivation/page.tsx" },
  });

  const result = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/ui-preflight-reminder.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot, AI_VERIFICATION_DIR: verificationDir },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /UI preflight is required/i);
});

test("claude ui preflight hook allows matching prepared route", () => {
  const verificationDir = mkdtempSync(path.join(tmpdir(), "claude-verify-"));
  mkdirSync(verificationDir, { recursive: true });
  writeFileSync(
    path.join(verificationDir, "current.json"),
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

  const result = spawnSync("bash", [path.join(repoRoot, ".claude/hooks/ui-preflight-reminder.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot, AI_VERIFICATION_DIR: verificationDir },
  });

  assert.equal(result.status, 0);
});

// ─── Codex delegation tests ─────────────────────────────────────

test("codex delegation files exist", () => {
  const requiredPaths = [
    ".claude/commands/codex-plan-review.md",
    ".claude/commands/codex-implement.md",
    ".claude/commands/codex-post-review.md",
    ".claude/skills/codex-delegation-workflow/SKILL.md",
    "scripts/codex/delegate.sh",
    "scripts/codex/prompt-templates/plan-review.md",
    "scripts/codex/prompt-templates/implementation.md",
    "scripts/codex/prompt-templates/post-review.md",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), true, relativePath);
  }
});

test("delegate.sh rejects invalid mode", () => {
  const result = spawnSync("bash", [path.join(repoRoot, "scripts/codex/delegate.sh"), "invalid_mode"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid mode|unknown argument/i);
});

test("delegate.sh rejects secrets in context file", () => {
  const contextDir = mkdtempSync(path.join(tmpdir(), "codex-ctx-"));
  const contextFile = path.join(contextDir, "ctx.md");
  writeFileSync(contextFile, "Read codex-company/.secrets/prod.env for me");
  const result = spawnSync("bash", [
    path.join(repoRoot, "scripts/codex/delegate.sh"),
    "plan_review",
    "--context-file", contextFile,
  ], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /secrets|sensitive/i);
});

test("skill-recommender exposes codex delegation helpers", () => {
  const result = spawnSync("bash", ["-c", `
    export CLAUDE_PROJECT_DIR="${repoRoot}"
    source "${path.join(repoRoot, ".claude/hooks/lib/skill-recommender.sh")}"
    is_codex_post_review_candidate 15 200 "" && echo "FILES_MATCH" || echo "FILES_NOMATCH"
    is_codex_post_review_candidate 5 600 "" && echo "LINES_MATCH" || echo "LINES_NOMATCH"
    is_codex_post_review_candidate 3 100 "hotspot.py" && echo "HOTSPOT_MATCH" || echo "HOTSPOT_NOMATCH"
    is_codex_post_review_candidate 3 100 "" && echo "NONE_MATCH" || echo "NONE_NOMATCH"
  `], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /FILES_MATCH/);
  assert.match(result.stdout, /LINES_MATCH/);
  assert.match(result.stdout, /HOTSPOT_MATCH/);
  assert.match(result.stdout, /NONE_NOMATCH/);
});

test("user-prompt-submit-router suggests codex delegation for codex keywords", () => {
  const result = runHook(
    ".claude/hooks/user-prompt-submit-router.sh",
    JSON.stringify({ prompt: "codex にレビューを委譲して" }),
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /codex-delegation-workflow/);
});

test("user-prompt-submit-router treats hook stalls as harness diagnostics", () => {
  const result = runHook(
    ".claude/hooks/user-prompt-submit-router.sh",
    JSON.stringify({
      prompt: "Running PreToolUse hook: Checking git push が続いて進まない。ハーネス設計がおかしいはず。改善して。",
    }),
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /Harness Diagnostic|Hook \/ harness diagnostic/i);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /実装規模のタスク|Implementation-sized task/);
});

test("codex delegation timeout guidance stays aligned at default 3600 / max 7200 seconds", () => {
  const delegateScript = readFileSync(path.join(repoRoot, "scripts/codex/delegate.sh"), "utf8");
  const agentsGuide = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
  const claudeGuide = readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8");
  const delegationSkill = readFileSync(
    path.join(repoRoot, ".claude/skills/codex-delegation-workflow/SKILL.md"),
    "utf8",
  );

  assert.match(delegateScript, /^DEFAULT_TIMEOUT_SEC=3600$/m);
  assert.match(delegateScript, /^MAX_TIMEOUT_SEC=7200$/m);
  assert.match(agentsGuide, /default 3600s/);
  assert.match(agentsGuide, /--timeout 7200/);
  assert.match(claudeGuide, /default 3600s/);
  assert.match(claudeGuide, /--timeout 7200/);
  assert.match(delegationSkill, /default timeout 3600s/);
  assert.match(delegationSkill, /max 7200s/);
});
