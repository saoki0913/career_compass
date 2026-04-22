import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { syncPipeline } from "./sync-pipeline.mjs";

const EXPECTED_HARNESS_INVENTORY = {
  agents: 13,
  hooksTopLevelSh: 13,
  opusAgents: 11,
  sonnetAgents: 2,
  claudeSkills: 41,
  canonicalSkills: 19,
};

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

    // .claude/commands/ is intentionally not generated — Claude skills take precedence
    // over same-named commands, so we only emit SKILL.md under .claude/skills/.
    assert.throws(
      () =>
        readFileSync(
          path.join(repoRoot, ".claude/commands/grill-me.md"),
          "utf8",
        ),
      /ENOENT/,
      ".claude/commands/ must not be generated",
    );

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

test("harness inventory counts match expected baseline", () => {
  // 本テストは v3/v4 で揃えた agent / hook / skill の件数と agent 定義の
  // Context7 coverage / model 配分が意図せず崩れた場合に CI で fail させる。
  // 期待値と docs/ops/AI_HARNESS.md §7.4 は 1:1 で揃える運用。
  const projectRoot = path.resolve(import.meta.dirname, "../..");

  const agentDir = path.join(projectRoot, ".claude/agents");
  const agents = readdirSync(agentDir).filter((f) => f.endsWith(".md"));
  assert.equal(
    agents.length,
    EXPECTED_HARNESS_INVENTORY.agents,
    `expected ${EXPECTED_HARNESS_INVENTORY.agents} agents, found ${agents.length}`,
  );

  const hookDir = path.join(projectRoot, ".claude/hooks");
  const hooks = readdirSync(hookDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".sh"))
    .map((e) => e.name);
  assert.equal(
    hooks.length,
    EXPECTED_HARNESS_INVENTORY.hooksTopLevelSh,
    `expected ${EXPECTED_HARNESS_INVENTORY.hooksTopLevelSh} top-level hooks, found ${hooks.length}`,
  );

  assert.ok(
    existsSync(path.join(hookDir, "lib/skill-recommender.sh")),
    ".claude/hooks/lib/skill-recommender.sh must exist",
  );

  let opus = 0;
  let sonnet = 0;
  for (const f of agents) {
    const content = readFileSync(path.join(agentDir, f), "utf8");
    const m = content.match(/^model:\s*(opus|sonnet)\b/m);
    if (m?.[1] === "opus") opus += 1;
    if (m?.[1] === "sonnet") sonnet += 1;
  }
  assert.equal(
    opus,
    EXPECTED_HARNESS_INVENTORY.opusAgents,
    `expected ${EXPECTED_HARNESS_INVENTORY.opusAgents} opus agents, found ${opus}`,
  );
  assert.equal(
    sonnet,
    EXPECTED_HARNESS_INVENTORY.sonnetAgents,
    `expected ${EXPECTED_HARNESS_INVENTORY.sonnetAgents} sonnet agents, found ${sonnet}`,
  );

  for (const f of agents) {
    const content = readFileSync(path.join(agentDir, f), "utf8");
    assert.match(content, /Context7/, `${f} must reference Context7`);
  }

  const claudeSkillDir = path.join(projectRoot, ".claude/skills");
  const claudeSkills = readdirSync(claudeSkillDir);
  assert.equal(
    claudeSkills.length,
    EXPECTED_HARNESS_INVENTORY.claudeSkills,
    `expected ${EXPECTED_HARNESS_INVENTORY.claudeSkills} .claude/skills entries, found ${claudeSkills.length}`,
  );

  const canonicalSkillDir = path.join(projectRoot, ".agents/skills");
  const canonicalSkills = readdirSync(canonicalSkillDir);
  assert.equal(
    canonicalSkills.length,
    EXPECTED_HARNESS_INVENTORY.canonicalSkills,
    `expected ${EXPECTED_HARNESS_INVENTORY.canonicalSkills} .agents/skills entries, found ${canonicalSkills.length}`,
  );

  for (const entry of claudeSkills) {
    const full = path.join(claudeSkillDir, entry);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) {
      assert.ok(existsSync(full), `broken symlink: .claude/skills/${entry}`);
    }
  }
});
