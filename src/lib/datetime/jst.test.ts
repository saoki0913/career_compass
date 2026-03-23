import { describe, expect, it } from "vitest";
import { getJstDateKey, getJstHour, isDailySummaryHourJst, startOfJstDayAsUtc } from "./jst";

describe("jst", () => {
  it("isDailySummaryHourJst", () => {
    expect(isDailySummaryHourJst(9)).toBe(true);
    expect(isDailySummaryHourJst(8)).toBe(false);
  });

  it("startOfJstDayAsUtc aligns with JST midnight", () => {
    const d = new Date("2026-06-15T12:00:00.000Z");
    const start = startOfJstDayAsUtc(d);
    expect(start.toISOString()).toBe("2026-06-14T15:00:00.000Z");
    expect(getJstDateKey(d)).toBe("2026-06-15");
  });

  it("getJstHour returns Tokyo hour", () => {
    const d = new Date("2026-06-15T00:30:00.000Z");
    expect(getJstHour(d)).toBe(9);
  });
});
