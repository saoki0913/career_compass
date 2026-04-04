import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { syncPipeline } from "./sync-pipeline.mjs";

function makeSkillSource({
  name,
  description,
  commandDescription,
  cursorDescription,
  body,
}) {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `command_description: ${commandDescription}`,
    `cursor_description: ${cursorDescription}`,
    "---",
    "",
    body,
    "",
  ].join("\n");
}

test("syncPipeline renders codex, claude, and cursor artifacts from canonical sources", async () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "agent-pipeline-"));

  try {
    await mkdir(path.join(repoRoot, "private/agent-pipeline/skills"), { recursive: true });
    await mkdir(path.join(repoRoot, "private/agent-pipeline/templates"), { recursive: true });

    writeFileSync(
      path.join(repoRoot, "private/agent-pipeline/skills/grill-me.md"),
      makeSkillSource({
        name: "grill-me",
        description: "Run a deep product and design interview before implementation.",
        commandDescription: "Start the Grill Me interview workflow.",
        cursorDescription: "Guide Cursor through the Grill Me workflow.",
        body: "# Grill Me\n\nAsk questions until the plan is unambiguous.",
      }),
      "utf8",
    );

    writeFileSync(
      path.join(repoRoot, "private/agent-pipeline/templates/prd-template.md"),
      "# PRD Template\n",
      "utf8",
    );

    await syncPipeline({ repoRoot });

    const codexSkill = readFileSync(
      path.join(repoRoot, ".codex/skills/grill-me/SKILL.md"),
      "utf8",
    );
    assert.match(codexSkill, /^---\nname: grill-me\n/);
    assert.match(codexSkill, /Ask questions until the plan is unambiguous\./);

    const codexCommand = readFileSync(
      path.join(repoRoot, ".codex/commands/grill-me.md"),
      "utf8",
    );
    assert.match(codexCommand, /description: Start the Grill Me interview workflow\./);
    assert.match(codexCommand, /<instructions>/);
    assert.match(codexCommand, /Use the canonical pipeline skill `grill-me`/);

    const claudeSkill = readFileSync(
      path.join(repoRoot, ".claude/skills/grill-me/SKILL.md"),
      "utf8",
    );
    assert.match(claudeSkill, /language: ja/);

    const claudeCommand = readFileSync(
      path.join(repoRoot, ".claude/commands/grill-me.md"),
      "utf8",
    );
    assert.match(claudeCommand, /# Grill Me/);
    assert.doesNotMatch(claudeCommand, /<instructions>/);

    const cursorRule = readFileSync(
      path.join(repoRoot, ".cursor/rules/grill-me.mdc"),
      "utf8",
    );
    assert.match(cursorRule, /description: Guide Cursor through the Grill Me workflow\./);
    assert.match(cursorRule, /alwaysApply: false/);
    assert.match(
      cursorRule,
      /Prompt template: `private\/agent-pipeline\/cursor-prompts\/grill-me.md`/,
    );

    const cursorPrompt = readFileSync(
      path.join(repoRoot, "private/agent-pipeline/cursor-prompts/grill-me.md"),
      "utf8",
    );
    assert.match(cursorPrompt, /# Grill Me/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
