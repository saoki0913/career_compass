import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("GakuchikaConversationContent", () => {
  it("uses CharLimitSelector instead of inline char limit buttons", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("CharLimitSelector");
    expect(source).not.toContain("charLimitHelperText");
  });

  it("shows gakuchikaDraftHelperText via sidebar component", async () => {
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

  it("uses shared ConversationRestartConfirmDialog instead of gakuchika-specific one", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationRestartConfirmDialog");
    expect(source).not.toContain("GakuchikaRestartConfirmDialog");
  });

  it("uses shared ConversationMobileStatus component", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationMobileStatus");
  });

  it("uses shared DraftReadyCTA for pause state", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("DraftReadyCTA");
  });

  it("delegates sidebar to GakuchikaConversationSidebar", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("GakuchikaConversationSidebar");
  });
});
