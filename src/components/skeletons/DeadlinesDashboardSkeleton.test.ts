import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("DeadlinesDashboardSkeleton", () => {
  it("renders 4 kanban columns matching DeadlinesDashboardClient", async () => {
    const source = await readFile(
      new URL("./DeadlinesDashboardSkeleton.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("xl:grid-cols-4");
    expect(source).toContain("md:grid-cols-2");
  });

  it("does not include stat cards in the inline skeleton", async () => {
    const source = await readFile(
      new URL("./DeadlinesDashboardSkeleton.tsx", import.meta.url),
      "utf8",
    );
    // DeadlinesDashboardSkeleton (inline) should not have stat cards
    const inlineMatch = source.match(
      /function DeadlinesDashboardSkeleton\b[\s\S]*?^}/m,
    );
    if (inlineMatch) {
      expect(inlineMatch[0]).not.toContain("StatCardSkeleton");
    }
  });
});
