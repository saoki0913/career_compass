import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

test("cursor harness docs and core artifacts exist", () => {
  const requiredPaths = [
    ".cursor/mcp.json",
    ".cursor/rules/career-compass-core.mdc",
    "docs/ops/CURSOR_HARNESS.md",
  ];

  for (const relativePath of requiredPaths) {
    assert.equal(existsSync(path.join(repoRoot, relativePath)), true, relativePath);
  }
});

test("cursor mcp matches the shared playwright and notion set", () => {
  const source = JSON.parse(readFileSync(path.join(repoRoot, ".cursor/mcp.json"), "utf8"));

  assert.deepEqual(Object.keys(source.mcpServers).sort(), ["notion", "playwright"]);
  assert.equal(source.mcpServers.playwright.command, "npx");
  assert.equal(source.mcpServers.notion.url, "https://mcp.notion.com/mcp");
});

test("cursor core rule stays alwaysApply and keeps repo guardrails", () => {
  const source = readFileSync(path.join(repoRoot, ".cursor/rules/career-compass-core.mdc"), "utf8");

  assert.match(source, /^alwaysApply: true$/m);
  assert.match(source, /AGENTS\.md/);
  assert.match(source, /codex-company\/\.secrets\//);
  assert.match(source, /ui:preflight/);
  assert.match(source, /generated\/manual/i);
});

test("generated cursor rules stay aligned with canonical pipeline skills", () => {
  const canonicalCount = readdirSync(path.join(repoRoot, "private/agent-pipeline/skills"))
    .filter((file) => file.endsWith(".md"))
    .length;
  const generatedCount = readdirSync(path.join(repoRoot, ".cursor/rules"))
    .filter((file) => file.endsWith(".mdc") && file !== "career-compass-core.mdc" && file !== "provider-ops.mdc")
    .length;

  assert.equal(generatedCount, canonicalCount);
});

test("cursor harness doc explains source-of-truth and intentional tool differences", () => {
  const source = readFileSync(path.join(repoRoot, "docs/ops/CURSOR_HARNESS.md"), "utf8");

  assert.match(source, /AGENTS\.md/);
  assert.match(source, /\.cursor\/rules\/career-compass-core\.mdc/);
  assert.match(source, /private\/agent-pipeline\/cursor-prompts/);
  assert.match(source, /hook\/subagent 機構をそのまま持たない/);
});
