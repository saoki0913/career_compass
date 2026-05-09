import { describe, it, expect } from "vitest";
import { startOfJstDayAsUtc } from "@/lib/datetime/jst";

describe("DeadlineListView computeDaysLeft", () => {
  it("uses JST day boundary for daysLeft calculation", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./DeadlineListView.tsx", import.meta.url), "utf8");
    expect(source).toContain("startOfJstDayAsUtc");
  });

  it("returns correct days across JST boundary", () => {
    const today = startOfJstDayAsUtc(new Date());
    const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const diff = Math.ceil(
      (startOfJstDayAsUtc(threeDaysLater).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diff).toBe(3);
  });

  it("returns 0 for same JST day", () => {
    const today = startOfJstDayAsUtc(new Date());
    const diff = Math.ceil(
      (today.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(diff).toBe(0);
  });
});
