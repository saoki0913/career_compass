import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ConversationSidebar", () => {
  it("exports ConversationSidebar as named export", async () => {
    const source = await readFile(new URL("./ConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("export function ConversationSidebar");
  });

  it("uses ConversationSidebarCard, ConversationProgressBar, and ConversationPhaseBar", async () => {
    const source = await readFile(new URL("./ConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("ConversationSidebarCard");
    expect(source).toContain("ConversationProgressBar");
    expect(source).toContain("ConversationPhaseBar");
  });

  it("supports setupContent that replaces progress and phase sections", async () => {
    const source = await readFile(new URL("./ConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("setupContent");
    expect(source).toMatch(/setupContent\??: ReactNode/);
  });

  it("renders reset button with configurable label and loading state", async () => {
    const source = await readFile(new URL("./ConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("showReset");
    expect(source).toContain("isResetting");
    expect(source).toContain("resetLabel");
    expect(source).toContain("会話をやり直す");
  });

  it("renders badges area and helperText", async () => {
    const source = await readFile(new URL("./ConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/badges\??: ReactNode/);
    expect(source).toContain("helperText");
  });

  it("passes progressChildren into ConversationProgressBar", async () => {
    const source = await readFile(new URL("./ConversationSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("progressChildren");
  });
});
