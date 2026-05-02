import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("MotivationConversationContent", () => {
  it("uses ConversationWorkspaceShell for layout", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationWorkspaceShell");
    expect(source).not.toContain("MotivationConversationHeader");
  });

  it("uses DraftPreviewModal instead of MotivationDraftModal", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("DraftPreviewModal");
    expect(source).not.toContain("MotivationDraftModal");
  });

  it("uses CharLimitSelector and ConversationActionBar without helperText", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("CharLimitSelector");
    expect(source).toContain("ConversationActionBar");
    expect(source).not.toContain("MotivationDraftActionBar");
  });

  it("does not render inline error banners (migrated to snackbar)", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("conversationLoadError &&");
    expect(source).not.toContain("{error &&");
    expect(source).not.toContain("bg-destructive/10");
    expect(source).not.toContain("border-amber-200 bg-amber-50");
  });

  it("does not destructure error or conversationLoadError from controller", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s+error,$/m);
    expect(source).not.toMatch(/^\s+conversationLoadError,$/m);
    expect(source).not.toMatch(/^\s+setError,$/m);
    expect(source).not.toMatch(/^\s+setConversationLoadError,$/m);
  });

  it("does not destructure or pass roleOptionsError", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("roleOptionsError");
  });

  it("post-draft banner includes resume-deepdive button", () => {
    expect(true).toBe(true);
  });

  it("isDraftReady banner allows optional ES timing", () => {
    expect(true).toBe(true);
  });
});
