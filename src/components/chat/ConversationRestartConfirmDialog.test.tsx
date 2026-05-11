import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ConversationRestartConfirmDialog", () => {
  it("exports ConversationRestartConfirmDialog as named export", async () => {
    const source = await readFile(new URL("./ConversationRestartConfirmDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function ConversationRestartConfirmDialog");
  });

  it("uses shadcn Dialog components", async () => {
    const source = await readFile(new URL("./ConversationRestartConfirmDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("Dialog");
    expect(source).toContain("DialogContent");
    expect(source).toContain("DialogHeader");
    expect(source).toContain("DialogFooter");
    expect(source).toContain("DialogTitle");
    expect(source).toContain("DialogDescription");
  });

  it("supports customizable title, description, and confirmLabel", async () => {
    const source = await readFile(new URL("./ConversationRestartConfirmDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("title?:");
    expect(source).toContain("description?:");
    expect(source).toContain("confirmLabel?:");
  });

  it("shows Loader2 spinner during confirming state", async () => {
    const source = await readFile(new URL("./ConversationRestartConfirmDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("Loader2");
    expect(source).toContain("isConfirming");
    expect(source).toContain("animate-spin");
  });

  it("hides close button on DialogContent", async () => {
    const source = await readFile(new URL("./ConversationRestartConfirmDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("showCloseButton={false}");
  });

  it("prevents closing while confirming", async () => {
    const source = await readFile(new URL("./ConversationRestartConfirmDialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("!isConfirming");
  });
});
