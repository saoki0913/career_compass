import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("useMotivationPostDraftState", () => {
  it("exports the hook", async () => {
    const mod = await import("./useMotivationPostDraftState");
    expect(mod.useMotivationPostDraftState).toBeDefined();
  });

  it("does not reference deps.setError or deps.setConversationLoadError", async () => {
    const source = await readFile(new URL("./useMotivationPostDraftState.ts", import.meta.url), "utf8");
    expect(source).not.toContain("deps.setError");
    expect(source).not.toContain("deps.setConversationLoadError");
  });

  it("PostDraftDeps interface does not include setError or setConversationLoadError", async () => {
    const source = await readFile(new URL("./useMotivationPostDraftState.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/setError:\s*\(/);
    expect(source).not.toMatch(/setConversationLoadError:\s*\(/);
  });
});
