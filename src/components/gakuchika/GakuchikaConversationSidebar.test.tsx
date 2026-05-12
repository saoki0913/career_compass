import { describe, expect, it } from "vitest";

describe("GakuchikaConversationSidebar", () => {
  it("module exports the component", async () => {
    const mod = await import("./GakuchikaConversationSidebar");
    expect(mod.GakuchikaConversationSidebar).toBeDefined();
  });

  it("uses 2-column progress layout", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./GakuchikaConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("progressColumns={2}");
    expect(source).not.toContain("progressColumns={4}");
  });
});
