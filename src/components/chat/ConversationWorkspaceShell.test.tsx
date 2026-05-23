import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("ConversationWorkspaceShell", () => {
  it("uses the compact shared product title size", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("PRODUCT_PAGE_TITLE_CLASS");
    expect(source).not.toContain("sm:text-3xl");
    expect(source).not.toContain("text-xl font-bold tracking-tight text-foreground sm:text-2xl");
  });

  it("uses the shared small product back button for conversation pages", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("ProductBackButton");
    expect(source).toContain('label={backLabel || "戻る"}');
    expect(source).not.toContain("rounded-2xl bg-slate-950");
    expect(source).not.toContain("text-white");
  });

  it("reserves mobile space for the sidebar toggle like product headers", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET");
  });

  it("keeps subtitles on one line instead of wrapping into two columns", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("truncate text-sm text-muted-foreground");
    expect(source).toContain("lg:hidden");
    expect(source).toContain("lg:block");
  });

  it("accepts titleExtra prop for rendering extra content after subtitle", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    expect(source).toContain("titleExtra");
    expect(source).toMatch(/titleExtra\??: ReactNode/);
  });

  it("renders titleExtra after subtitle in the header", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    const subtitleIdx = source.indexOf("{subtitle}");
    const titleExtraIdx = source.indexOf("{titleExtra}", subtitleIdx);
    expect(titleExtraIdx).toBeGreaterThan(subtitleIdx);
  });

  it("accepts a conversationFooter slot outside the scrollable conversation body", async () => {
    const source = await readFile(new URL("./ConversationWorkspaceShell.tsx", import.meta.url), "utf8");
    const conversationIdx = source.indexOf("{conversation}");
    const footerIdx = source.indexOf("{conversationFooter}", conversationIdx);
    const composerIdx = source.indexOf("{composer}", footerIdx);

    expect(source).toMatch(/conversationFooter\??: ReactNode/);
    expect(footerIdx).toBeGreaterThan(conversationIdx);
    expect(composerIdx).toBeGreaterThan(footerIdx);
  });
});
