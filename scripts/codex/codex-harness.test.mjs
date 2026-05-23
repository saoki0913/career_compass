import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  buildDisplayArtifact,
  buildReviewArtifact,
  buildRunArtifact,
  buildUserQuestionDisplay,
} from "./agent-dialogue.mjs";

const repoRoot = process.cwd();

function runHook(relativePath, input) {
  return spawnSync("bash", [path.join(repoRoot, relativePath)], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
  });
}

function runHookWithEnv(relativePath, input, env) {
  return spawnSync("bash", [path.join(repoRoot, relativePath)], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
  });
}


function withStagedRootFiles(count, callback) {
  const dirName = `.codex-harness-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const dir = path.join(repoRoot, dirName);
  const indexFile = path.join(tmpdir(), `${dirName}.index`);
  const objectsDir = path.join(tmpdir(), `${dirName}.objects`);
  const gitEnv = {
    ...process.env,
    GIT_INDEX_FILE: indexFile,
    GIT_OBJECT_DIRECTORY: objectsDir,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(repoRoot, ".git/objects"),
  };
  mkdirSync(dir, { recursive: true });
  mkdirSync(objectsDir, { recursive: true });
  const files = Array.from({ length: count }, (_, index) => path.join(dir, `fixture-${index}.md`));
  try {
    const readTree = spawnSync("git", ["read-tree", "HEAD"], { cwd: repoRoot, env: gitEnv, encoding: "utf8" });
    assert.equal(readTree.status, 0, readTree.stderr);
    for (const file of files) {
      writeFileSync(file, `fixture ${file}
`, "utf8");
    }
    const relativeFiles = files.map((file) => path.relative(repoRoot, file));
    const add = spawnSync("git", ["add", "--", ...relativeFiles], { cwd: repoRoot, env: gitEnv, encoding: "utf8" });
    assert.equal(add.status, 0, add.stderr);
    return callback(relativeFiles, { GIT_INDEX_FILE: indexFile });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(indexFile, { force: true });
    rmSync(objectsDir, { recursive: true, force: true });
  }
}

function writeCommitAutonomyIntent(stateDir, sessionId) {
  writeFileSync(path.join(stateDir, `autonomy-intent-${sessionId}.json`), JSON.stringify({
    schemaVersion: 1,
    kind: "codex-autonomy-intent",
    decision: "approved",
    issuer: "codex-user-prompt-router",
    createdAt: "2026-05-23T00:00:00Z",
    promptHash: "test",
    actions: ["test", "commit"],
    releaseModes: [],
  }, null, 2), "utf8");
}

function writeAutonomyIntent(stateDir, sessionId, { production = true } = {}) {
  writeFileSync(path.join(stateDir, `autonomy-intent-${sessionId}.json`), JSON.stringify({
    schemaVersion: 1,
    kind: "codex-autonomy-intent",
    decision: "approved",
    issuer: "codex-user-prompt-router",
    createdAt: "2026-05-18T00:00:00Z",
    promptHash: "test",
    actions: production
      ? ["test", "push", "release", "production-promotion"]
      : ["test", "push", "release"],
    releaseModes: production
      ? ["staging", "production", "release"]
      : ["staging", "release"],
  }, null, 2), "utf8");
}

test("codex harness docs and commands exist", () => {
  const requiredPaths = [
    ".codex/commands/reset-changes.md",
    ".codex/commands/update-docs.md",
    ".codex/commands/codex-start.md",
    ".codex/commands/codex-closeout.md",
    ".codex/hooks.json",
    "docs/operations/development/CODEX_HARNESS.md",
    ".agents/agents/README.md",
    ".codex/agents/architect.toml",
    ".codex/agents/nextjs-developer.toml",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), true, relativePath);
  }
});

test("codex dialogue artifacts separate internal run data from user-facing display", () => {
  const resultDir = path.join(tmpdir(), "codex-dialogue-fixture");
  const meta = {
    mode: "post_review",
    request_id: "post_review-20260513-demo",
    model: "gpt-5.5",
    timestamp: "2026-05-13T00:00:00Z",
    exit_code: 0,
    duration_ms: 1200,
    status: "SUCCESS",
    context_file: null,
    timeout_sec: 3600,
    image_count: 0,
  };
  const run = buildRunArtifact({ meta, resultDir, project: repoRoot });
  const review = buildReviewArtifact({
    meta,
    result: [
      "## 状態",
      "REQUEST_CHANGES",
      "",
      "## 指摘",
      "- severity: high | src/example.ts:12 | 入力値の検証が不足しています。",
    ].join("\n"),
    snapshot: {
      headSha: "abc123",
      stagedDiffHash: "internal-hash",
      files: ["src/example.ts"],
    },
  });
  const display = buildDisplayArtifact({ run, review });
  const displayText = JSON.stringify(display);

  assert.equal(review.stagedDiffHash, "internal-hash");
  assert.equal(display.title, "コードレビューが完了");
  assert.match(display.summary, /修正が必要/);
  assert.doesNotMatch(displayText, /stagedDiffHash|headSha|checkpoint|meta\.json|review\.json|tool_input/);
});

test("codex question display keeps AskUserQuestion wording human-readable", () => {
  const display = buildUserQuestionDisplay({
    question: "この変更では、どの確認を実行しますか？",
    recommendedOption: "必要な確認を実行する",
    impactSummary: "選んだ確認だけを実行し、結果を見てから次へ進みます。",
    options: [
      {
        label: "必要な確認を実行する",
        description: "変更範囲に合う確認を先に済ませます。",
      },
      {
        label: "今回は実行しない",
        description: "確認を省略する理由を記録して次へ進みます。",
      },
    ],
  });
  const displayText = JSON.stringify(display);

  assert.match(display.question, /どの確認を実行しますか/);
  assert.doesNotMatch(displayText, /SESSION_ID|checkpoint|stagedDiffHash|tool_input|AskUserQuestionTool/);
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
  assert.match(result.stderr, /push はまだ実行できません/);
  assert.match(result.stderr, /対象コミットを確認/);
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

test("codex pre-tool dispatcher blocks raw dotenv env loading", () => {
  for (const command of [
    "dotenv -e .env.local -- printenv",
    "npx dotenv -e .env.local -- vercel deploy --prod",
    "dotenv -p SENTRY_AUTH_TOKEN",
  ]) {
    const result = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      tool_name: "Bash",
      tool_input: { command },
    }));

    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /env|key|secrets|リリース|外部サービス/i, command);
  }
});

test("claude pre-tool dispatcher also blocks raw dotenv env loading", () => {
  const result = runHookWithEnv(".claude/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "dotenv -e .env.local -- printenv" },
  }), { CLAUDE_PROJECT_DIR: repoRoot });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /env|key|secrets/i);
});

test("codex bash output guard scans tool_response output", () => {
  const secret = "sk-proj-" + "1234567890abcdefghijklmnop";
  const result = runHook(".codex/hooks/post-bash-output-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_response: { stdout: `OPENAI_API_KEY=${secret}` },
  }));

  assert.equal(result.status, 0);
  assert.match(result.stderr, /leaked secret material/i);
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
  const source = readFileSync(path.join(repoRoot, "docs/operations/development/CODEX_HARNESS.md"), "utf8");
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

  const codeReviewer = readFileSync(path.join(agentDir, "code-reviewer.toml"), "utf8");
  assert.match(codeReviewer, /^model = "gpt-5\.5"$/m);
  assert.match(codeReviewer, /^model_reasoning_effort = "high"$/m);
  assert.match(codeReviewer, /three independent code-reviewer passes in parallel/);
});

test("codex config aligns with the 13-agent routing and shared MCP set", () => {
  const source = readFileSync(path.join(repoRoot, ".codex/config.toml"), "utf8");

  assert.match(source, /^\[agents\]$/m);
  assert.match(source, /^\[features\]$/m);
  assert.match(source, /^(codex_)?hooks = true$/m);
  assert.match(source, /^max_threads = 6$/m);
  assert.match(source, /^max_depth = 1$/m);
  assert.match(source, /^\[mcp_servers\.playwright\]$/m);
  assert.match(source, /^\[mcp_servers\.notion\]$/m);
  assert.match(source, /^\[mcp_servers\.playwright\]\nenabled = false$/m);
  assert.match(source, /^\[mcp_servers\.notion\]\nenabled = false$/m);
  assert.doesNotMatch(source, /^\[mcp_servers\.(github|supabase|openaiDeveloperDocs)\]$/m);

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
  assert.equal("statusMessage" in preToolHooks[0], false);
  assert.match(source, /features\.codex_hooks|session-orientation\.sh|pre-tool-dispatcher\.sh/s);
  assert.doesNotMatch(source, /stop-plaintext-confirm-guard\.sh/);
});

test("codex user-prompt router allows questions about secret file procedures", () => {
  const result = runHook(".codex/hooks/user-prompt-submit-router.sh", JSON.stringify({
    prompt: "How should I check codex-company/.secrets/career_compass without reading secret values?",
  }));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("codex post-tool hooks stay limited to edit follow-ups", () => {
  const source = readFileSync(path.join(repoRoot, ".codex/hooks.json"), "utf8");
  const config = JSON.parse(source);
  const bashPostToolEntry = config.hooks.PostToolUse.find((entry) => entry.matcher === "Bash");
  const editPostToolEntry = config.hooks.PostToolUse.find((entry) => entry.matcher === "apply_patch|Edit|Write");

  assert.equal(bashPostToolEntry, undefined);
  assert.ok(editPostToolEntry);
  assert.match(editPostToolEntry.hooks[0].command, /post-edit-dispatcher\.sh/);
});

test("codex hooks and commands do not tell Codex to call AskUserQuestion", () => {
  const checkedPaths = [
    ".codex/hooks/git-branch-guard.sh",
    ".codex/hooks/test-category-gate.sh",
    ".codex/hooks/stop-plaintext-confirm-guard.sh",
    ".codex/commands/reset-changes.md",
    ".codex/commands/update-docs.md",
    ".codex/skills/quality-gate-audit/SKILL.md",
  ];

  for (const relativePath of checkedPaths) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /AskUserQuestionTool/);
    assert.doesNotMatch(source, /Ask the user with AskUserQuestion/);
    assert.doesNotMatch(source, /requires AskUserQuestion approval/);
    assert.doesNotMatch(source, /AskUserQuestion で/);
  }
});

test("codex branch gate describes checkpoint-based confirmation and test gate auto-allows execution", () => {
  const branch = runHook(".codex/hooks/git-branch-guard.sh", JSON.stringify({
    session_id: "sess-branch",
    tool_name: "Bash",
    tool_input: { command: "git checkout -b feature/demo" },
  }));
  assert.equal(branch.status, 2);
  assert.match(branch.stderr, /ブランチ作成はまだ実行できません/);
  assert.match(branch.stderr, /用途と理由を確認/);

  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-test-auto-"));
  const testGate = runHookWithEnv(".codex/hooks/test-category-gate.sh", JSON.stringify({
    session_id: "sess-test",
    tool_name: "Bash",
    tool_input: { command: "npx tsc --noEmit" },
  }), { HOME: homeDir });
  assert.equal(testGate.status, 0);
  assert.equal(testGate.stderr, "");
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

test("codex pre-tool dispatcher blocks compound staging and commit commands", () => {
  for (const command of ["git add . && git commit -m test", "git commit -am test"]) {
    const result = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: "sess-commit",
      tool_name: "Bash",
      tool_input: { command },
    }));

    assert.equal(result.status, 2, command);
    assert.match(result.stderr, /大きなコミット|対象ファイルを明示/);
  }
});

test("codex user-prompt router grants commit-only autonomy for local split commits", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-commit-intent-"));
  const result = runHookWithEnv(".codex/hooks/user-prompt-submit-router.sh", JSON.stringify({
    session_id: "sess-commit-intent",
    prompt: "ローカルの変更を分割してコミットして。push はしない。",
  }), { HOME: homeDir });

  assert.equal(result.status, 0);
  const intentPath = path.join(homeDir, ".codex/sessions/career_compass/autonomy-intent-sess-commit-intent.json");
  const intent = JSON.parse(readFileSync(intentPath, "utf8"));
  assert.deepEqual(intent.actions, ["test", "commit"]);
  assert.deepEqual(intent.releaseModes, []);

  const pushHomeDir = mkdtempSync(path.join(tmpdir(), "codex-commit-push-intent-"));
  const pushResult = runHookWithEnv(".codex/hooks/user-prompt-submit-router.sh", JSON.stringify({
    session_id: "sess-commit-push-intent",
    prompt: "ローカル変更をコミットしてから push して。",
  }), { HOME: pushHomeDir });
  assert.equal(pushResult.status, 0);
  const pushIntent = JSON.parse(readFileSync(
    path.join(pushHomeDir, ".codex/sessions/career_compass/autonomy-intent-sess-commit-push-intent.json"),
    "utf8",
  ));
  assert.deepEqual(pushIntent.actions, ["test", "push", "commit"]);
  assert.deepEqual(pushIntent.releaseModes, []);
});

test("codex commit autonomy creates staged checkpoints for large local split commits", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-commit-auto-"));
  const stateDir = path.join(homeDir, ".codex/sessions/career_compass");
  mkdirSync(stateDir, { recursive: true });
  writeCommitAutonomyIntent(stateDir, "sess-local-commit");

  withStagedRootFiles(10, (_relativeFiles, gitEnv) => {
    const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: "sess-local-commit",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command: "git commit -m local-split" },
    }), { HOME: homeDir, ...gitEnv });

    assert.equal(result.status, 0, result.stderr);
    const review = JSON.parse(readFileSync(path.join(stateDir, "codex-commit-delegation-sess-local-commit"), "utf8"));
    const categories = JSON.parse(readFileSync(path.join(stateDir, "test-categories-sess-local-commit"), "utf8"));
    assert.equal(review.kind, "commit-review");
    assert.equal(review.decision, "codex-autonomy-local-commit");
    assert.equal(categories.categories["e2e-functional"], "skip:all");
    assert.match(review.commandHash, /^[a-f0-9]{64}$/);
  });
});

test("codex pre-tool dispatcher blocks provider CLI but auto-allows direct static checks", () => {
  const provider = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-release",
    tool_name: "Bash",
    tool_input: { command: "vercel deploy --prod" },
  }));
  assert.equal(provider.status, 2);
  assert.match(provider.stderr, /リリースまたは外部サービス操作/);

  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-static-auto-"));
  const staticCheck = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-static",
    tool_name: "Bash",
    tool_input: { command: "npx tsc --noEmit" },
  }), { HOME: homeDir });
  assert.equal(staticCheck.status, 0);
  assert.equal(staticCheck.stderr, "");
});

test("codex autonomy intent allows safe push and production repo scripts without claude state", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-autonomy-"));
  const stateDir = path.join(homeDir, ".codex/sessions/career_compass");
  mkdirSync(stateDir, { recursive: true });
  writeAutonomyIntent(stateDir, "sess-auto", { production: true });

  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  const staging = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "staging-verified",
    "--decision",
    "verified",
    "--project",
    repoRoot,
    "--release-mode",
    "staging",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(staging.status, 0);
  writeFileSync(path.join(stateDir, `staging-verified-${head}`), staging.stdout, "utf8");

  for (const command of ["npx tsc --noEmit"]) {
    const manifestArgs = [
      path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
      "checkpoint",
      "--kind",
      "codex-autonomy",
      "--decision",
      "approved",
      "--issuer",
      "codex-autonomy",
      "--project",
      repoRoot,
      "--release-mode",
      "production",
      "--categories",
      "e2e-functional=run:gakuchika,quality=skip,static=run,security=run",
      "--actions",
      "test",
      "--command",
      command,
    ];
    if (command === "git push origin develop") {
      manifestArgs.push("--remote", "origin", "--refspec", "develop");
    }
    const manifest = spawnSync("node", manifestArgs, { cwd: repoRoot, encoding: "utf8" });
    assert.equal(manifest.status, 0);
    writeFileSync(path.join(stateDir, "autonomy-manifest-sess-auto.json"), manifest.stdout, "utf8");

    const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: "sess-auto",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command },
    }), { HOME: homeDir });

    assert.equal(result.status, 0, command);
    assert.equal(result.stderr, "", command);
  }

  for (const command of [
    "git push origin develop",
    "make deploy-production",
  ]) {
    const manifest = spawnSync("node", [
      path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
      "checkpoint",
      "--kind",
      "codex-autonomy",
      "--decision",
      "approved",
      "--issuer",
      "codex-autonomy",
      "--project",
      repoRoot,
      "--release-mode",
      "production",
      "--categories",
      "e2e-functional=run:gakuchika,quality=skip,static=run,security=run",
      "--actions",
      "push,release,test,production-promotion",
      "--command",
      command,
      ...(command === "git push origin develop" ? ["--remote", "origin", "--refspec", "develop"] : []),
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(manifest.status, 0);
    writeFileSync(path.join(stateDir, "autonomy-manifest-sess-auto.json"), manifest.stdout, "utf8");

    const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: "sess-auto",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command },
    }), { HOME: homeDir });

    assert.equal(result.status, 0, command);
    assert.equal(result.stderr, "", command);
  }

  assert.equal(existsSync(path.join(homeDir, ".claude")), false);
});

test("codex autonomy manifest does not allow compound release commands", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-autonomy-compound-"));
  const stateDir = path.join(homeDir, ".codex/sessions/career_compass");
  mkdirSync(stateDir, { recursive: true });
  writeAutonomyIntent(stateDir, "sess-compound", { production: true });

  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
  const staging = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "staging-verified",
    "--decision",
    "verified",
    "--project",
    repoRoot,
    "--release-mode",
    "staging",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(staging.status, 0);
  writeFileSync(path.join(stateDir, `staging-verified-${head}`), staging.stdout, "utf8");

  const command = "make deploy-production; vercel deploy --prod";
  const manifest = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "codex-autonomy",
    "--decision",
    "approved",
    "--issuer",
    "codex-autonomy",
    "--project",
    repoRoot,
    "--release-mode",
    "production",
    "--actions",
    "push,release,test,production-promotion",
    "--command",
    command,
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(manifest.status, 0);
  writeFileSync(path.join(stateDir, "autonomy-manifest-sess-compound.json"), manifest.stdout, "utf8");

  const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-compound",
    cwd: repoRoot,
    tool_name: "Bash",
    tool_input: { command },
  }), { HOME: homeDir });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /本番|リリース|外部サービス|確認|ESCALATION_REQUIRED/);
});

test("codex non-production autonomy intent does not allow production release script", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-autonomy-nonprod-"));
  const stateDir = path.join(homeDir, ".codex/sessions/career_compass");
  mkdirSync(stateDir, { recursive: true });
  writeAutonomyIntent(stateDir, "sess-nonprod", { production: false });

  const command = "zsh scripts/release/release-career-compass.sh --production";
  const manifest = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "codex-autonomy",
    "--decision",
    "approved",
    "--issuer",
    "codex-autonomy",
    "--project",
    repoRoot,
    "--release-mode",
    "production",
    "--actions",
    "release,production-promotion",
    "--command",
    command,
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(manifest.status, 0);
  writeFileSync(path.join(stateDir, "autonomy-manifest-sess-nonprod.json"), manifest.stdout, "utf8");

  const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-nonprod",
    cwd: repoRoot,
    tool_name: "Bash",
    tool_input: { command },
  }), { HOME: homeDir });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /本番|リリース|確認|STAGING_NOT_VERIFIED/);
});

test("codex autonomy manifest does not override hard-deny operations", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-autonomy-deny-"));
  const stateDir = path.join(homeDir, ".codex/sessions/career_compass");
  mkdirSync(stateDir, { recursive: true });

  const manifest = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "codex-autonomy",
    "--decision",
    "approved",
    "--issuer",
    "codex-autonomy",
    "--project",
    repoRoot,
    "--actions",
    "push,release,test,production-promotion",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(manifest.status, 0);
  writeFileSync(path.join(stateDir, "autonomy-manifest-sess-deny.json"), manifest.stdout, "utf8");

  for (const [command, pattern] of [
    ["git push --force origin develop", /force/i],
    ["cat .env.local", /env|key|secrets/i],
    ["rm -rf src/components", /削除操作|delete/i],
  ]) {
    const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: "sess-deny",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command },
    }), { HOME: homeDir });

    assert.equal(result.status, 2, command);
    assert.match(result.stderr, pattern, command);
  }

  assert.equal(existsSync(path.join(homeDir, ".claude")), false);
});

test("codex pre-tool dispatcher allows read-only release checks without release approval", () => {
  for (const command of [
    "make ops-release-check",
    "zsh scripts/release/release-career-compass.sh --check",
    "zsh scripts/release/sync-career-compass-secrets.sh --check --target all",
  ]) {
    const result = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: "sess-release-check",
      tool_name: "Bash",
      tool_input: { command },
    }));

    assert.equal(result.status, 0, command);
    assert.equal(result.stderr, "", command);
  }
});

test("codex pre-tool dispatcher blocks production secret apply through make variable syntax", () => {
  const result = runHook(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-secret-apply",
    tool_name: "Bash",
    tool_input: { command: "make ops-secrets-sync SYNC_MODE=--apply TARGET=all" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /本番向けシークレット/);
});

test("codex pre-tool dispatcher runs later guards after a satisfied migration gate", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-union-gates-"));
  mkdirSync(path.join(homeDir, ".codex/sessions/career_compass"), { recursive: true });

  const checkpoint = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "migration",
    "--decision",
    "approved",
    "--project",
    repoRoot,
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(checkpoint.status, 0);
  writeFileSync(
    path.join(homeDir, ".codex/sessions/career_compass/migration-approved-sess-union"),
    checkpoint.stdout,
    "utf8",
  );

  const result = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
    session_id: "sess-union",
    cwd: repoRoot,
    tool_name: "Bash",
    tool_input: { command: "make deploy-production deploy-migrate" },
  }), { HOME: homeDir });

  assert.equal(result.status, 2);
  // The guard must fail closed (status 2) with any valid block reason.
  // In the local dev environment a pending Supabase migration causes
  // SUPABASE_MIGRATION_PENDING to fire before ESCALATION_REQUIRED ("本番へ反映する前に").
  // The safety contract is "block on uncertainty regardless of which gate fires first",
  // so we accept the full set of legitimate fail-closed reason tokens here.
  assert.match(result.stderr, /MIGRATION_DRY_RUN_UNAVAILABLE|MIGRATION_HISTORY_DIVERGED|SUPABASE_MIGRATION_PENDING|MIGRATION_DRY_RUN_FAILED|ESCALATION_REQUIRED|本番へ反映する前に|DB変更を反映/);
});

test("codex migration safety guard fails closed when dry-run classification is unavailable", () => {
  const result = runHook(".codex/hooks/migration-safety-guard.sh", JSON.stringify({
    session_id: "sess-migrate",
    tool_name: "Bash",
    tool_input: { command: "scripts/release/run-migrations.mjs --env production --json" },
  }));

  assert.equal(result.status, 2);
  // The guard must fail closed (status 2 + decision:block) regardless of which specific
  // gate fires first.  In environments with a pending Supabase migration the guard emits
  // SUPABASE_MIGRATION_PENDING before reaching the MIGRATION_DRY_RUN_UNAVAILABLE branch,
  // but both represent the same safety contract: "block on uncertainty".
  // Accepted fail-closed reason tokens (from migration-safety-guard.sh):
  //   MIGRATION_DRY_RUN_UNAVAILABLE, MIGRATION_HISTORY_DIVERGED,
  //   SUPABASE_MIGRATION_PENDING, MIGRATION_DRY_RUN_FAILED, ESCALATION_REQUIRED
  assert.match(result.stderr, /MIGRATION_DRY_RUN_UNAVAILABLE|MIGRATION_HISTORY_DIVERGED|SUPABASE_MIGRATION_PENDING|MIGRATION_DRY_RUN_FAILED|ESCALATION_REQUIRED|DB変更を反映/);
});

test("codex migration safety guard blocks non-empty dry-run failure JSON", () => {
  const fakeProject = mkdtempSync(path.join(tmpdir(), "codex-migration-json-"));
  mkdirSync(path.join(fakeProject, "scripts/harness"), { recursive: true });
  mkdirSync(path.join(fakeProject, "scripts/release"), { recursive: true });
  copyFileSync(
    path.join(repoRoot, "scripts/harness/guard-core.sh"),
    path.join(fakeProject, "scripts/harness/guard-core.sh"),
  );
  copyFileSync(
    path.join(repoRoot, "scripts/harness/command-classifier.mjs"),
    path.join(fakeProject, "scripts/harness/command-classifier.mjs"),
  );
  writeFileSync(
    path.join(fakeProject, "scripts/release/run-migrations.mjs"),
    [
      "process.stdout.write(JSON.stringify({",
      "  pending: 0,",
      "  supabasePending: 0,",
      "  historyErrors: ['drizzle history diverged'],",
      "  blockers: [],",
      "  classifications: [],",
      "  exitCode: 1,",
      "}));",
      "process.exit(1);",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = runHook(".codex/hooks/migration-safety-guard.sh", JSON.stringify({
    session_id: "sess-migrate-json",
    cwd: fakeProject,
    tool_name: "Bash",
    tool_input: { command: "scripts/release/run-migrations.mjs --env production --json" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /MIGRATION_HISTORY_DIVERGED/);
});

test("codex pre-tool dispatcher auto-allows important test commands", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-important-tests-auto-"));
  for (const [index, command] of [
    "bash scripts/security/run-lightweight-scan.sh --staged-only --fail-on=critical",
    "AI_LIVE_LOCAL_FEATURES=gakuchika bash scripts/dev/run-ai-live-local.sh",
    "npm run test:e2e:functional:local:gakuchika",
    "npm run test:quality:all",
    "npm run test:security:light",
    "npm run test:static",
    "npx tsc --noEmit",
    "make test-e2e-functional-gakuchika",
    "make test-e2e-functional-local AI_LIVE_LOCAL_FEATURES=motivation",
    "make AI_LIVE_LOCAL_FEATURES=motivation test-e2e-functional-local",
    "bash scripts/ci/run-e2e-functional.sh --features gakuchika",
  ].entries()) {
    const important = runHookWithEnv(".codex/hooks/pre-tool-dispatcher.sh", JSON.stringify({
      session_id: `sess-test-category-${index}`,
      tool_name: "Bash",
      tool_input: { command },
    }), { HOME: homeDir });
    assert.equal(important.status, 0, command);
    assert.equal(important.stderr, "", command);
  }
});

test("codex test-category gate blocks uncovered quality feature", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-test-quality-"));
  mkdirSync(path.join(homeDir, ".codex/sessions/career_compass"), { recursive: true });
  const checkpointPath = path.join(homeDir, ".codex/sessions/career_compass/test-categories-sess-quality");
  const checkpoint = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "test-categories",
    "--project",
    repoRoot,
    "--categories",
    "e2e-functional=skip,quality=run:gakuchika,static=run,security=run",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(checkpoint.status, 0);
  writeFileSync(checkpointPath, checkpoint.stdout, "utf8");

  const result = spawnSync("bash", [path.join(repoRoot, ".codex/hooks/test-category-gate.sh")], {
    cwd: repoRoot,
    env: { ...process.env, HOME: homeDir },
    input: JSON.stringify({
      session_id: "sess-quality",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command: "AI_LIVE_TEST_CATEGORY=quality bash scripts/ci/run-ai-live.sh --feature motivation" },
    }),
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /motivation/);
});

test("codex user-prompt router treats hook stalls as harness diagnostics", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-router-diagnostic-"));
  const result = runHookWithEnv(".codex/hooks/user-prompt-submit-router.sh", JSON.stringify({
    session_id: "sess-router-diagnostic",
    prompt: "Running PreToolUse hook: Checking git push が続いて進まない。ハーネス設計がおかしいはず。改善して。",
  }), { HOME: homeDir });

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /Hook \/ harness diagnostic/i);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /Implementation-sized task|Architecture-impacting task/);
  assert.equal(existsSync(path.join(homeDir, ".codex/sessions/career_compass/autonomy-intent-sess-router-diagnostic.json")), false);
});

test("codex user-prompt router does not record autonomy intent for negated push requests", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-router-negated-"));
  const result = runHookWithEnv(".codex/hooks/user-prompt-submit-router.sh", JSON.stringify({
    session_id: "sess-router-negated",
    prompt: "Please review the release hooks but do not push or deploy.",
  }), { HOME: homeDir });

  assert.equal(result.status, 0);
  assert.equal(existsSync(path.join(homeDir, ".codex/sessions/career_compass/autonomy-intent-sess-router-negated.json")), false);
});

test("pipeline doc no longer references removed grill-me step", () => {
  const source = readFileSync(path.join(repoRoot, "docs/operations/development/AI_AGENT_PIPELINE.md"), "utf8");
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
  assert.match(source, /internal working context/i);
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

test("codex prompt edit dispatcher records blocking quality debt", () => {
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
  const debtPath = path.join(homeDir, ".codex/sessions/career_compass/prompt-review-pending-sess-prompt.json");
  assert.equal(existsSync(debtPath), true);
  const debt = JSON.parse(readFileSync(debtPath, "utf8"));
  assert.equal(debt.kind, "prompt-review-pending");
  assert.equal(debt.decision, "verification-required");
  assert.deepEqual(debt.changedFiles, ["backend/app/prompts/es_review.py"]);

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
  assert.match(guard.stderr, /verification debt is pending/i);
});

test("codex destructive rm guard blocks unsafe recursive deletion", () => {
  const result = runHook(".codex/hooks/destructive-rm-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "rm -rf src/components" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /この削除操作は実行できません/);
});

test("codex destructive guard blocks git clean", () => {
  const result = runHook(".codex/hooks/destructive-rm-guard.sh", JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "git clean -fdx" },
  }));

  assert.equal(result.status, 2);
  assert.match(result.stderr, /この削除操作は実行できません/);
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

test("codex permission request guard allows intent-backed push but denies direct provider mutation", () => {
  const homeDir = mkdtempSync(path.join(tmpdir(), "codex-permission-autonomy-"));
  const stateDir = path.join(homeDir, ".codex/sessions/career_compass");
  mkdirSync(stateDir, { recursive: true });
  writeAutonomyIntent(stateDir, "sess-permission", { production: false });

  const manifest = spawnSync("node", [
    path.join(repoRoot, "scripts/harness/diff-snapshot.mjs"),
    "checkpoint",
    "--kind",
    "codex-autonomy",
    "--decision",
    "approved",
    "--issuer",
    "codex-autonomy",
    "--project",
    repoRoot,
    "--actions",
    "push,release",
    "--command",
    "git push origin develop",
    "--remote",
    "origin",
    "--refspec",
    "develop",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(manifest.status, 0);
  writeFileSync(path.join(stateDir, "autonomy-manifest-sess-permission.json"), manifest.stdout, "utf8");

  const push = runHookWithEnv(".codex/hooks/permission-request-guard.sh", JSON.stringify({
    session_id: "sess-permission",
    cwd: repoRoot,
    tool_name: "Bash",
    tool_input: { command: "git push origin develop" },
  }), { HOME: homeDir });
  assert.equal(push.status, 0);
  assert.equal(push.stdout, "");

  const provider = runHookWithEnv(".codex/hooks/permission-request-guard.sh", JSON.stringify({
    session_id: "sess-permission",
    cwd: repoRoot,
    tool_name: "Bash",
    tool_input: { command: "vercel deploy --prod" },
  }), { HOME: homeDir });
  assert.equal(provider.status, 0);
  const parsed = JSON.parse(provider.stdout);
  assert.equal(parsed.hookSpecificOutput.decision.behavior, "deny");
});

test("delegate.sh isolates delegated Codex runs from user-level MCP startup", () => {
  const source = readFileSync(path.join(repoRoot, "scripts/codex/delegate.sh"), "utf8");

  assert.match(source, /CODEX_EXEC_COMMON_ARGS=\(/);
  assert.match(source, /experimental_use_rmcp_client=false/);
  assert.match(source, /--ignore-user-config/);
  assert.match(source, /--ephemeral/);
  assert.doesNotMatch(source, /mcp_servers\.context7/);
  assert.doesNotMatch(source, /context7/);
  assert.doesNotMatch(source, /--profile(?:\s|=)/);
  assert.doesNotMatch(source, /features\.rmcp_client\s*=\s*true/);
  assert.doesNotMatch(source, /experimental_use_rmcp_client\s*=\s*true/);
  assert.match(source, /PLAN_REVIEW_PARALLELISM=3/);
  assert.match(source, /POST_REVIEW_PARALLELISM=3/);
  assert.match(source, /post_review\)\n\s+MODEL_REASONING_EFFORT="high"/);

  const caseBlocks = [...source.matchAll(/case "\$MODE" in([\s\S]*?)esac/g)].map((match) => match[1]);
  assert.ok(caseBlocks.length > 0, "case block must exist in delegate.sh");
  const executionCaseBlock = caseBlocks.find((caseBlock) => caseBlock.includes("codex exec"));
  assert.ok(executionCaseBlock, "execution case block must exist in delegate.sh");
  const modeBlocks = executionCaseBlock.split(/\n\s*;;\s*\n/);
  const expectedModes = ["plan_review", "implementation", "post_review", "imagegen"];

  for (const modeName of expectedModes) {
    const block = modeBlocks.find((b) => new RegExp(`^\\s*${modeName}\\)`).test(b));
    assert.ok(block, `${modeName} block must exist`);
    assert.match(
      block,
      /\$\{CODEX_EXEC_COMMON_ARGS\[@\]\}/,
      `${modeName} mode must use shared Codex exec args`,
    );
  }
});

test("codex stop plaintext confirmation guard is advisory and never blocks closeout", () => {
  const result = runHook(".codex/hooks/stop-plaintext-confirm-guard.sh", JSON.stringify({
    stop_hook_active: false,
    last_assistant_message: "コミットしますか？ push はまだしません。",
  }));

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.continue, true);
});

// Regression guard for the blocking-security-audit finding: a blanket
// removal of the unsafe-shell-expansion block let `$VAR`/`$()` defeat the
// pre-expansion literal-text predicates (forged checkpoints -> prod deploy
// with no approval). The scoped re-block must keep dangerous expansion
// blocked on BOTH dispatchers while benign read-only expansion still passes.
test("pre-tool dispatchers block expansion-hidden dangerous ops, allow benign expansion", () => {
  const dispatch = (rt, command) =>
    spawnSync("bash", [path.join(repoRoot, `.${rt}/hooks/pre-tool-dispatcher.sh`)], {
      cwd: repoRoot,
      input: JSON.stringify({ session_id: "sec-reg", cwd: repoRoot, tool_name: "Bash", tool_input: { command } }),
      encoding: "utf8",
    }).status;

  for (const rt of ["codex", "claude"]) {
    // forged-checkpoint via expansion must hard-block; literal checkpoint
    // creation remains available after the confirmation flow.
    assert.equal(dispatch(rt, 'K=push; node scripts/harness/diff-snapshot.mjs checkpoint --kind $K --decision approved --project .'), 2, `${rt} $K checkpoint`);
    assert.equal(dispatch(rt, 'node scripts/harness/diff-snapshot.mjs checkpoint --kind push --decision approved --project .'), 0, `${rt} literal checkpoint`);
    // dangerous op hidden behind $VAR / $()
    assert.equal(dispatch(rt, 'G=deploy-production; make $G'), 2, `${rt} make $G`);
    assert.equal(dispatch(rt, 'G=git; $G push origin main'), 2, `${rt} $G push`);
    assert.equal(dispatch(rt, 'G=git; ${G} push origin main'), 2, `${rt} braced G push`);
    assert.equal(dispatch(rt, 'G=git; "${G}" push origin main'), 2, `${rt} quoted braced G push`);
    assert.equal(dispatch(rt, '${G:-git} push origin main'), 2, `${rt} defaulted G push`);
    assert.equal(dispatch(rt, '$(echo git) push origin main'), 2, `${rt} command substitution git push`);
    assert.equal(dispatch(rt, 'G=git; command $G push origin main'), 2, `${rt} command $G push`);
    assert.equal(dispatch(rt, 'G=git; exec $G push origin main'), 2, `${rt} exec $G push`);
    assert.equal(dispatch(rt, 'G=git; ($G push origin main)'), 2, `${rt} grouped $G push`);
    assert.equal(dispatch(rt, 'set -- git push origin main; "$@"'), 2, `${rt} positional "$@" git push`);
    assert.equal(dispatch(rt, 'set -- g it pu sh; $1$2 $3$4 origin main'), 2, `${rt} concatenated positional git push`);
    assert.equal(dispatch(rt, 'R=rm; $R -rf src'), 2, `${rt} $R -rf`);
    assert.equal(dispatch(rt, 'R=rm; ${R} -rf src'), 2, `${rt} braced R -rf`);
    assert.equal(dispatch(rt, 'R=rm; "${R}" -rf src'), 2, `${rt} quoted braced R -rf`);
    assert.equal(dispatch(rt, '$(printf rm) -rf src'), 2, `${rt} command substitution rm`);
    assert.equal(dispatch(rt, 'R=rm; command $R -rf src'), 2, `${rt} command $R -rf`);
    assert.equal(dispatch(rt, 'set -- rm -rf src; "$@"'), 2, `${rt} positional "$@" rm -rf`);
    assert.equal(dispatch(rt, 'set -- r m -f r; $1$2 $3$4 src'), 2, `${rt} concatenated positional rm -fr`);
    assert.equal(dispatch(rt, 'R=rm; nohup $R -r src'), 2, `${rt} nohup $R -r`);
    assert.equal(dispatch(rt, 'R=rm; sudo $R -r src'), 2, `${rt} sudo $R -r`);
    assert.equal(dispatch(rt, 'R=rm; nice $R --recursive src'), 2, `${rt} nice $R recursive`);
    assert.equal(dispatch(rt, 'R=rm; time $R -R src'), 2, `${rt} time $R -R`);
    assert.equal(dispatch(rt, 'R=rm; noglob $R -r src'), 2, `${rt} noglob $R -r`);
    assert.equal(dispatch(rt, 'R=rm; nocorrect $R --recursive src'), 2, `${rt} nocorrect $R recursive`);
    assert.equal(dispatch(rt, 'R=rm; { $R -fr src; }'), 2, `${rt} grouped $R -fr`);
    assert.equal(dispatch(rt, 'R=rm; if true; then $R -fr src; fi'), 2, `${rt} if $R -fr`);
    assert.equal(dispatch(rt, 'X=-rf; rm $X /'), 2, `${rt} rm $X`);
    assert.equal(dispatch(rt, 'eval "$(echo git push --force)"'), 2, `${rt} eval $()`);
    assert.equal(dispatch(rt, 'F=.env.local; cat $F'), 2, `${rt} cat $F .env`);
    // benign read-only expansion must still pass (the #1 noise fix preserved)
    assert.equal(dispatch(rt, 'grep -r "$(date +%Y)" src'), 0, `${rt} grep $(date)`);
    assert.equal(dispatch(rt, 'echo "$(whoami)"'), 0, `${rt} echo $(whoami)`);
  }
});

// Regression guard for blocking-review H1: gr_is_subagent must rely ONLY on
// the deterministic transcript_path. A session-scoped marker would mislabel
// the main agent (subagents share the parent session_id).
test("gr_is_subagent never mislabels the main agent (no session-scoped marker)", () => {
  const probe = (json) =>
    spawnSync("bash", ["-c", `. "${path.join(repoRoot, "scripts/harness/guard-runtime.sh")}"; gr_is_subagent '${json}' claude`], {
      cwd: repoRoot, encoding: "utf8",
    }).status;
  // subagent transcript -> detected (0)
  assert.equal(probe('{"transcript_path":"/p/s/subagents/agent-x.jsonl","session_id":"h1"}'), 0);
  // main-agent transcript -> NOT a subagent (1). gr_is_subagent no longer
  // consults any session-scoped marker, so a shared session_id can never
  // mislabel the main agent (the H1 contamination is structurally gone).
  assert.equal(probe('{"transcript_path":"/p/h1.jsonl","session_id":"h1"}'), 1);
});
