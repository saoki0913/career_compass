import { describe, expect, it } from "vitest";

describe("ConversationPageSkeleton", () => {
  it("delegates to ConversationWorkspaceShellSkeleton", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ConversationWorkspaceShellSkeleton");
    expect(source).toContain("SidebarCardSkeleton");
  });

  it("does not contain old layout classes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    // Old skeleton had wrong max-width and reversed grid ratios
    expect(source).not.toContain("max-w-7xl");
    expect(source).not.toContain("rounded-[28px]");
    expect(source).not.toContain("xl:grid-cols-[0.9fr_1.1fr]");
  });

  it("includes Motivation-specific sidebar cards", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    // Progress card with badge pills + Company info card with evidence rows
    expect(source).toContain("SkeletonPill");
    expect(source).toContain("SkeletonCircle");
  });

  it("exports ConversationPageSkeleton with accent prop", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./ConversationPageSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("export function ConversationPageSkeleton");
    expect(source).toContain("accent");
  });
});
