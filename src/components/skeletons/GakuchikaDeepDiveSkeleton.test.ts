import { describe, expect, it } from "vitest";

describe("GakuchikaDeepDiveSkeleton", () => {
  it("delegates to ConversationWorkspaceShellSkeleton", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./GakuchikaDeepDiveSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ConversationWorkspaceShellSkeleton");
    expect(source).toContain("SidebarCardSkeleton");
  });

  it("does not contain old layout classes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./GakuchikaDeepDiveSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("max-w-7xl");
    expect(source).not.toContain("lg:grid-cols-[minmax(0,1.7fr)");
  });

  it("includes 3 sidebar cards for Gakuchika", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./GakuchikaDeepDiveSkeleton.tsx", import.meta.url),
      "utf8",
    );
    const cardCount = (source.match(/SidebarCardSkeleton/g) || []).length;
    // 1 import + 3 usages = 4 total occurrences
    expect(cardCount).toBeGreaterThanOrEqual(4);
  });

  it("exports GakuchikaDeepDiveSkeleton with accent prop", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./GakuchikaDeepDiveSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("export function GakuchikaDeepDiveSkeleton");
    expect(source).toContain("accent");
  });
});
