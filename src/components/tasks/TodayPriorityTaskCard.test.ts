import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("TodayPriorityTaskCard", () => {
  it("renders accessible completion button with aria-label", async () => {
    const source = await readFile(
      new URL("./TodayPriorityTaskCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("aria-label={`${todayTask.task.title}を完了にする`}");
  });

  it("preserves 44px touch target on mobile", async () => {
    const source = await readFile(
      new URL("./TodayPriorityTaskCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("h-11 w-11");
  });

  it("hides company metadata on mobile via responsive class", async () => {
    const source = await readFile(
      new URL("./TodayPriorityTaskCard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("sm:inline-flex");
  });
});
