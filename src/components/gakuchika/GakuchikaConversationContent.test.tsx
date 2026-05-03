import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("GakuchikaConversationContent", () => {
  it("uses CharLimitSelector instead of inline char limit buttons", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("CharLimitSelector");
    expect(source).not.toContain("helperText={");
  });

  it("shows gakuchikaDraftHelperText in the sidebar progress card", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("gakuchikaDraftHelperText");
  });

  it("uses DraftPreviewModal instead of GakuchikaDraftModal", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("DraftPreviewModal");
    expect(source).not.toContain("GakuchikaDraftModal");
  });

  it("does not render inline error banner (migrated to snackbar)", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("border-destructive/20 bg-destructive/10");
  });
});
