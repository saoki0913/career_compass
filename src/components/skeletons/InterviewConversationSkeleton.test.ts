import { describe, expect, it } from "vitest";

describe("InterviewConversationSkeleton", () => {
  it("delegates to ConversationWorkspaceShellSkeleton", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./InterviewConversationSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("ConversationWorkspaceShellSkeleton");
    expect(source).toContain("SidebarCardSkeleton");
  });

  it("does not contain old layout classes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./InterviewConversationSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain("max-w-7xl");
    expect(source).not.toContain("rounded-[28px]");
    expect(source).not.toContain("lg:grid-cols-[minmax(0,1.7fr)");
  });

  it("includes 4 sidebar cards for Interview", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./InterviewConversationSkeleton.tsx", import.meta.url),
      "utf8",
    );
    const cardCount = (source.match(/SidebarCardSkeleton/g) || []).length;
    // 1 import + 4 usages = 5 total occurrences
    expect(cardCount).toBeGreaterThanOrEqual(5);
  });

  it("exports InterviewConversationSkeleton with accent prop", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      new URL("./InterviewConversationSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("export function InterviewConversationSkeleton");
    expect(source).toContain("accent");
  });
});
