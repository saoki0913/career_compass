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
    ".codex/hooks.json",
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

test("git-push-guard blocks normal push without approval checkpoint", () => {
  const result = runHook(".codex/hooks/git-push-guard.sh", JSON.stringify({
    session_id: "sess-push",
    tool_name: "Bash",
    tool_input: { command: "git push origin develop" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /approval checkpoint/i);
});

test("secrets-guard blocks direct secret reads", () => {
  const result = runHook(".codex/hooks/secrets-guard.sh", JSON.stringify({
    tool_name: "Read",
    file_path: "codex-company/.secrets/test.env",
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /secrets|env|key/i);
});

test("secrets-guard blocks filesystem MCP secret reads", () => {
  const result = runHook(".codex/hooks/secrets-guard.sh", JSON.stringify({
    tool_name: "mcp__filesystem__read_file",
    tool_input: { path: "codex-company/.secrets/test.env" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /secrets|env|key/i);
});

test("secrets-guard blocks bash reads of env files", () => {
  const result = runHook(".codex/hooks/secrets-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "cat .env.local" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /env|key|secrets/i);
});

test("secrets-guard allows non-secret private project files", () => {
  const result = runHook(".codex/hooks/secrets-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "sed -n '1,20p' private/agent-pipeline/skills/grill-me.md" },
  }));

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
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
  const tracked = spawnSync("git", ["ls-files", ".codex/agents"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(tracked.status, 0);
  const files = tracked.stdout
    .trim()
    .split(/\n/)
    .filter(Boolean)
    .map((filePath) => path.basename(filePath))
    .filter((file) => file.endsWith(".toml"));

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
  assert.match(source, /^\[features\]$/m);
  assert.match(source, /^codex_hooks = true$/m);
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

test("codex lifecycle hooks are wired for safety and quality gates", () => {
  const source = readFileSync(path.join(repoRoot, ".codex/hooks.json"), "utf8");
  const config = JSON.parse(source);

  assert.ok(config.hooks.SessionStart);
  assert.ok(config.hooks.PreToolUse);
  assert.ok(config.hooks.PermissionRequest);
  assert.ok(config.hooks.PostToolUse);
  assert.ok(config.hooks.UserPromptSubmit);
  assert.ok(config.hooks.Stop);

  const preToolHooks = config.hooks.PreToolUse.flatMap((entry) => entry.hooks);
  assert.equal(preToolHooks.length, 1);
  assert.match(preToolHooks[0].command, /pre-tool-dispatcher\.sh/);
  assert.match(preToolHooks[0].statusMessage, /tool safety gates/i);
  assert.match(source, /features\.codex_hooks|session-orientation\.sh|pre-tool-dispatcher\.sh/s);
  assert.match(source, /stop-plaintext-confirm-guard\.sh/);
});

test("codex bash post-tool triage stays visually quiet on normal commands", () => {
  const source = readFileSync(path.join(repoRoot, ".codex/hooks.json"), "utf8");
  const config = JSON.parse(source);
  const bashPostToolEntry = config.hooks.PostToolUse.find((entry) => entry.matcher === "Bash");

  assert.ok(bashPostToolEntry);
  assert.match(bashPostToolEntry.hooks[0].command, /post-tool-failure-triage\.sh/);
  assert.equal(bashPostToolEntry.hooks[0].statusMessage, undefined);
});

test("codex pre-tool dispatcher keeps harmless bash commands quiet", () => {
  const result = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git status" },
  }));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("codex pre-tool dispatcher still blocks force push", () => {
  const result = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git push --force origin main" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /force/i);
});

test("codex pre-tool dispatcher blocks provider CLI but allows static checks", () => {
  const provider = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-release",
    tool_name: "Bash",
    tool_input: { command: "vercel deploy --prod" },
  }));
  assert.equal(provider.status, 2);
  assert.match(provider.stderr, /provider|deploy|release/i);

  const staticCheck = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-static",
    tool_name: "Bash",
    tool_input: { command: "npx tsc --noEmit" },
  }));
  assert.equal(staticCheck.status, 0);
  assert.equal(staticCheck.stderr, "");
});

test("codex pre-tool dispatcher routes important test commands to test-category gate", () => {
  const important = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-test-category",
    tool_name: "Bash",
    tool_input: { command: "bash security/scan/run-lightweight-scan.sh --staged-only --fail-on=critical" },
  }));
  assert.equal(important.status, 2);
  assert.match(important.stderr, /Test command blocked/i);

  const staticCheck = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-static-free",
    tool_name: "Bash",
    tool_input: { command: "npx tsc --noEmit" },
  }));
  assert.equal(staticCheck.status, 0);
  assert.equal(staticCheck.stderr, "");
});

test("codex user-prompt router treats hook stalls as harness diagnostics", () => {
  const result = runHook(".codex/hooks/user-prompt-submit-router.sh", JSON.stringify({
    prompt: "Running PreToolUse hook: Checking git push が続いて進まない。ハーネス設計がおかしいはず。改善して。",
  }));

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /Hook \/ harness diagnostic/i);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /Implementation-sized task|Architecture-impacting task/);
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

test("codex ui preflight hook understands apply_patch file paths", () => {
  const verificationDir = mkdtempSync(path.join(tmpdir(), "codex-verify-"));
  const input = JSON.stringify({
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Update File: src/app/(product)/companies/[id]/motivation/page.tsx",
        "@@",
        "+const touched = true;",
        "*** End Patch",
      ].join("\n"),
    },
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

test("codex band-aid guard blocks apply_patch additions", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-hook-home-"));
  const input = JSON.stringify({
    session_id: "sess-band-aid",
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Update File: src/lib/example.ts",
        "@@",
        "+const value = input as any;",
        "*** End Patch",
      ].join("\n"),
    },
  });

  const result = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/bandaid-guard.sh")], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Band-aid pattern/i);
  assert.match(result.stderr, /as any/);
});

test("codex prompt edit dispatcher creates a pending confirmation gate", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-hook-home-"));
  const sessionId = "sess-prompt";
  const editInput = JSON.stringify({
    session_id: sessionId,
    tool_name: "apply_patch",
    tool_input: {
      command: [
        "*** Begin Patch",
        "*** Update File: backend/app/prompts/es_review.py",
        "@@",
        "+PROMPT = 'updated'",
        "*** End Patch",
      ].join("\n"),
    },
  });

  const dispatch = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/post-edit-dispatcher.sh")], {
    cwd: repoRoot,
    input: editInput,
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });
  assert.equal(dispatch.status, 0);

  const guard = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/prompt-edit-confirm-guard.sh")], {
    cwd: repoRoot,
    input: JSON.stringify({
      session_id: sessionId,
      tool_name: "apply_patch",
      tool_input: {
        command: [
          "*** Begin Patch",
          "*** Update File: src/lib/example.ts",
          "@@",
          "+export const value = 1;",
          "*** End Patch",
        ].join("\n"),
      },
    }),
    encoding: "utf8",
    env: { ...process.env, HOME: homeDir },
  });

  assert.equal(guard.status, 2);
  assert.match(guard.stderr, /confirmation is pending/i);
});

test("codex destructive rm guard blocks unsafe recursive deletion", () => {
  const result = runHook(".codex/hooks/destructive-rm-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "rm -rf src/components" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unsafe destructive delete/i);
});

test("codex destructive guard blocks git clean", () => {
  const result = runHook(".codex/hooks/destructive-rm-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git clean -fdx" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /destructive|git clean/i);
});

test("codex permission request guard denies force push approval", () => {
  const result = runHook(".codex/hooks/permission-request-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git push --force-with-lease origin develop" },
  }));

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "PermissionRequest");
  assert.equal(parsed.hookSpecificOutput.decision.behavior, "deny");
});

test("codex stop plaintext confirmation guard asks Codex to continue", () => {
  const result = runHook(".codex/hooks/stop-plaintext-confirm-guard.sh", JSON.stringify({
    stop_hook_active: false,
    last_assistant_message: "コミットしますか？ push はまだしません。",
  }));

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /plain text/i);
});
