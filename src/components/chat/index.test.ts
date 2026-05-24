import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("chat/index exports", () => {
  it("no longer re-exports the legacy DraftPreviewModal or CharLimitSelector", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).not.toContain("DraftPreviewModal");
    expect(source).not.toContain("CharLimitSelector");
  });

  it("re-exports shared conversation components (without the legacy generation dialogs)", async () => {
    const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("ConversationSidebar");
    expect(source).toContain("ConversationRestartConfirmDialog");
    expect(source).toContain("ReadyOutputBar");
    expect(source).toContain("ConversationMobileStatus");
    expect(source).not.toContain("EsDraftSettingsDialog");
    expect(source).not.toContain("ConversationSummaryDialog");
  });
});
