import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("gakuchika/index exports", () => {
  it("does not re-export GakuchikaDraftModal (replaced by DraftPreviewModal)", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).not.toContain("GakuchikaDraftModal");
  });

  it("does not export GakuchikaRestartConfirmDialog (replaced by shared ConversationRestartConfirmDialog)", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).not.toContain("GakuchikaRestartConfirmDialog");
  });

  it("exports GakuchikaConversationSidebar", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("GakuchikaConversationSidebar");
  });
});
