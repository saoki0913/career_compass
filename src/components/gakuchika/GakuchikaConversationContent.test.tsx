import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("GakuchikaConversationContent", () => {
  it("uses the shared GenerationModal for ES and feedback", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("GenerationModal");
    expect(source).toContain("ReadyOutputBar");
  });

  it("uses EsCharLimitField and DraftResultView as ES slots", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("EsCharLimitField");
    expect(source).toContain("DraftResultView");
  });

  it("no longer uses the legacy standalone generation modals", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("EsDraftSettingsDialog");
    expect(source).not.toContain("DraftPreviewModal");
    expect(source).not.toContain("ConversationSummaryDialog");
  });

  it("shows gakuchikaDraftHelperText via sidebar component", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("gakuchikaDraftHelperText");
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

  it("delegates sidebar to GakuchikaConversationSidebar", async () => {
    const source = await readFile(new URL("./GakuchikaConversationContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("GakuchikaConversationSidebar");
  });
});
