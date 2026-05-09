import { describe, it, expect } from "vitest";

describe("ChatInput", () => {
  it("exports ChatInput component", async () => {
    const mod = await import("./ChatInput");
    expect(mod.ChatInput).toBeDefined();
  });

  it("uses IME-aware composition handling", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
    expect(source).toContain("onCompositionStart");
    expect(source).toContain("onCompositionEnd");
    expect(source).toContain("isComposing");
  });
});
