import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("MotivationConversationContent", () => {
  it("uses ConversationWorkspaceShell for layout", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationWorkspaceShell");
  });

  it("uses the shared GenerationModal with ES slots", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("GenerationModal");
    expect(source).toContain("EsCharLimitField");
    expect(source).toContain("DraftResultView");
  });

  it("no longer uses the legacy standalone generation modals", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("EsDraftSettingsDialog");
    expect(source).not.toContain("DraftPreviewModal");
  });

  it("uses ReadyOutputBar for ready actions", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ReadyOutputBar");
  });

  it("keeps the header minimal (no mode badge in titleExtra)", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("titleExtra=");
  });

  it("does not duplicate progress hints in the conversation body (moved to sidebar)", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("今確認していること");
    expect(source).not.toContain("次に進む条件");
    expect(source).not.toContain("今回知りたいこと");
  });

  it("does not render inline error banners (migrated to snackbar)", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("conversationLoadError &&");
    expect(source).not.toContain("{error &&");
    expect(source).not.toContain("bg-destructive/10");
  });

  it("does not destructure error or conversationLoadError from controller", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s+error,$/m);
    expect(source).not.toMatch(/^\s+conversationLoadError,$/m);
  });

  it("uses ConversationRestartConfirmDialog instead of window.confirm", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationRestartConfirmDialog");
    expect(source).toContain("restartDialogOpen");
    expect(source).toContain("confirmResetConversation");
  });

  it("uses ConversationMobileStatus for mobile status bar", async () => {
    const source = await readFile(new URL("./MotivationConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationMobileStatus");
  });
});
