import { describe, expect, it } from "vitest";

describe("ConversationWorkspaceShellSkeleton", () => {
  it("mirrors ConversationWorkspaceShell container classes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("h-screen bg-background flex flex-col overflow-hidden");
    expect(source).toContain(
      "mx-auto flex w-full max-w-[96rem] flex-1 flex-col overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-8",
    );
    expect(source).toContain("PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET");
  });

  it("uses exact grid columns from the shell", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.7fr)]",
    );
    expect(source).toContain(
      "2xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,0.65fr)]",
    );
  });

  it("hides sidebar below xl breakpoint", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("hidden space-y-3 xl:flex xl:min-h-0 xl:flex-col xl:space-y-0");
  });

  it("has accessibility attributes on root", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain('aria-live="polite"');
  });

  it("renders 3 alternating message bubbles", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    const userMessages = (source.match(/justify-end/g) || []).length;
    const aiMessages = (source.match(/justify-start/g) || []).length;
    expect(userMessages).toBe(2);
    expect(aiMessages).toBe(1);
  });

  it("includes composer skeleton", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("shrink-0 border-t border-border/50");
    expect(source).toContain("min-h-[3rem]");
  });

  it("exports SidebarCardSkeleton matching ConversationSidebarCard", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationWorkspaceShellSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("SidebarCardSkeleton");
    expect(source).toContain("rounded-xl border border-border/50 bg-card");
    expect(source).toContain(
      "flex min-h-12 flex-row items-center justify-between gap-3 px-3.5 py-2.5",
    );
    expect(source).toContain("px-3.5 pb-3.5 pt-0");
  });
});
