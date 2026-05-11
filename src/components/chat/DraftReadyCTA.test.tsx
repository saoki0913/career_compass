import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("DraftReadyCTA", () => {
  it("exports DraftReadyCTA as named export", async () => {
    const source = await readFile(new URL("./DraftReadyCTA.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function DraftReadyCTA");
  });

  it("supports pre-draft and post-draft variants", async () => {
    const source = await readFile(new URL("./DraftReadyCTA.tsx", import.meta.url), "utf8");
    expect(source).toContain("pre-draft");
    expect(source).toContain("post-draft");
    expect(source).toContain("border-primary/20");
    expect(source).toContain("border-emerald-200");
  });

  it("uses outline button variant for pre-draft", async () => {
    const source = await readFile(new URL("./DraftReadyCTA.tsx", import.meta.url), "utf8");
    expect(source).toContain('"outline"');
  });

  it("supports pending state with label suffix", async () => {
    const source = await readFile(new URL("./DraftReadyCTA.tsx", import.meta.url), "utf8");
    expect(source).toContain("isActionPending");
  });

  it("uses responsive flex layout", async () => {
    const source = await readFile(new URL("./DraftReadyCTA.tsx", import.meta.url), "utf8");
    expect(source).toContain("flex-col");
    expect(source).toContain("sm:flex-row");
  });
});
