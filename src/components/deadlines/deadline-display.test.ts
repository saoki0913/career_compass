import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeDeadlineDaysLeft,
  formatDeadlineDueDate,
  getDeadlineDaysLeftClass,
  getDeadlineDaysLeftLabel,
} from "./deadline-display";

describe("deadline display helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses JST day boundaries for daysLeft calculation", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./deadline-display.ts", import.meta.url), "utf8");
    expect(source).toContain("startOfJstDayAsUtc");
  });

  it("returns direct JST day differences from a fixed current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T02:00:00.000Z"));

    expect(computeDeadlineDaysLeft("2026-03-20T14:59:00.000Z")).toBe(0);
    expect(computeDeadlineDaysLeft("2026-03-23T15:00:00.000Z")).toBe(4);
  });

  it("formats urgency labels for core deadline states", () => {
    expect(getDeadlineDaysLeftLabel(-2, "overdue")).toBe("2日超過");
    expect(getDeadlineDaysLeftLabel(0, "not_started")).toBe("今日");
    expect(getDeadlineDaysLeftLabel(1, "in_progress")).toBe("明日");
    expect(getDeadlineDaysLeftLabel(5, "completed")).toBe("完了");
  });

  it("uses destructive styling for overdue deadlines", () => {
    expect(getDeadlineDaysLeftClass(-1, "overdue")).toContain("text-destructive");
  });

  it("formats due dates in JST", () => {
    expect(formatDeadlineDueDate("2026-03-23T15:00:00.000Z")).toBe("3月24日");
  });
});
