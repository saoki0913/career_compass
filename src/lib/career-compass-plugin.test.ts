import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "career-compass-dev");
const manifestPath = path.join(
  pluginRoot,
  ".codex-plugin",
  "plugin.json",
);
const marketplacePath = path.join(
  repoRoot,
  ".agents",
  "plugins",
  "marketplace.json",
);

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("career-compass-dev plugin", () => {
  it("registers the repo-local plugin in the marketplace", () => {
    const marketplace = readJson(marketplacePath);
    const plugin = marketplace.plugins.find(
      (entry: { name: string }) => entry.name === "career-compass-dev",
    );

    expect(marketplace.name).toBeTruthy();
    expect(marketplace.interface.displayName).toBeTruthy();
    expect(plugin).toMatchObject({
      name: "career-compass-dev",
      source: {
        source: "local",
        path: "./plugins/career-compass-dev",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Developer Tools",
    });
  });

  it("declares manifest paths that exist on disk", () => {
    const manifest = readJson(manifestPath);

    expect(manifest.name).toBe("career-compass-dev");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.hooks).toBe("./hooks.json");
    expect(manifest.commands).toBe("./commands/");

    for (const relativePath of [
      manifest.skills,
      manifest.hooks,
      manifest.commands,
    ]) {
      expect(
        fs.existsSync(path.join(pluginRoot, relativePath)),
        `${relativePath} should exist`,
      ).toBe(true);
    }
  });

  it("uses the intent-based command taxonomy", () => {
    const manifest = readJson(manifestPath);
    const commandFiles = fs
      .readdirSync(path.join(pluginRoot, "commands"))
      .sort();

    expect(commandFiles).toEqual([
      "demo-video.md",
      "infra.md",
      "quality-check.md",
      "release.md",
      "ui-start.md",
    ]);
    expect(manifest.interface.defaultPrompt).toEqual([
      "UI 作業を標準フローで始めて",
      "この変更の品質確認フローを出して",
      "標準の本番リリース手順で進めて",
    ]);
  });

  it("ships the expected workflow skills", () => {
    const requiredFiles = [
      "skills/ui-change-check/SKILL.md",
      "skills/release-check/SKILL.md",
      "skills/demo-video-workflow/SKILL.md",
      "skills/rag-change-check/SKILL.md",
      "skills/security-change-check/SKILL.md",
      "skills/seo-change-check/SKILL.md",
      "skills/bugfix-workflow/SKILL.md",
      "skills/frontend-refactor-check/SKILL.md",
      "skills/backend-refactor-check/SKILL.md",
      "skills/infra-integration-check/SKILL.md",
      "hooks.json",
      "README.md",
    ];

    for (const relativePath of requiredFiles) {
      expect(
        fs.existsSync(path.join(pluginRoot, relativePath)),
        `${relativePath} should exist`,
      ).toBe(true);
    }
  });

  it("defines layer-based advisory hooks", () => {
    const hooks = readJson(path.join(pluginRoot, "hooks.json"));
    const ruleMap = Object.fromEntries(
      hooks.rules.map((rule: { name: string }) => [rule.name, rule]),
    );

    expect(hooks.mode).toBe("advisory");
    expect(Object.keys(ruleMap).sort()).toEqual([
      "backend-api",
      "demo-video",
      "marketing-ui",
      "product-ui",
      "rag-search",
      "release-infra",
      "security-sensitive",
    ]);
    expect(ruleMap["marketing-ui"].suggest).toEqual([
      "command:ui-start",
      "skill:seo-change-check",
    ]);
    expect(ruleMap["product-ui"].suggest).toEqual([
      "command:ui-start",
      "skill:frontend-refactor-check",
    ]);
    expect(ruleMap["backend-api"].suggest).toEqual([
      "command:quality-check",
      "skill:backend-refactor-check",
    ]);
    expect(ruleMap["rag-search"].suggest).toEqual([
      "command:quality-check",
      "skill:rag-change-check",
    ]);
    expect(ruleMap["release-infra"].suggest).toEqual([
      "command:release",
      "command:infra",
    ]);
    expect(ruleMap["demo-video"].suggest).toEqual([
      "command:demo-video",
    ]);
  });
});
