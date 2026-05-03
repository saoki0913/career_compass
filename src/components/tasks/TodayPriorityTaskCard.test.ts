import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("TodayPriorityTaskCard", () => {
  it("renders accessible completion button with aria-label", async () => {
    const source = await readFile(
      new URL("./TodayPriorityTaskCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('aria-label="今日の最重要タスクを完了にする"');
  });

  it("preserves 44px minimum touch target height", async () => {
    const source = await readFile(
      new URL("./TodayPriorityTaskCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("min-h-[44px]");
  });

  it("hides company metadata on mobile via responsive class", async () => {
    const source = await readFile(
      new URL("./TodayPriorityTaskCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("sm:inline-flex");
  });
});
