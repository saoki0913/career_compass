import { describe, it, expect } from "vitest";

describe("WeeklyScheduleView", () => {
  it("exports WeeklyScheduleView and getWeekDays", async () => {
    const mod = await import("./WeeklyScheduleView");
    expect(mod.WeeklyScheduleView).toBeDefined();
    expect(mod.getWeekDays).toBeDefined();
  });

  it("uses Google Calendar icon instead of generic calendar icon", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./WeeklyScheduleView.tsx", import.meta.url), "utf8");
    expect(source).toContain("GoogleCalendarIcon");
    expect(source).not.toMatch(/\bCalendarIcon\b/);
  });

  it("receives calendar connection state as a prop", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./WeeklyScheduleView.tsx", import.meta.url), "utf8");
    expect(source).toContain("isConnected?: boolean");
    expect(source).not.toContain("useGoogleCalendar");
  });

  it("has 9 time slots covering 09-17", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./WeeklyScheduleView.tsx", import.meta.url), "utf8");
    expect(source).toContain('"09"');
    expect(source).toContain('"13"');
    expect(source).toContain('"17"');
    expect(source).not.toContain('"19"');
  });
});

describe("getWeekDays", () => {
  it("returns 7 days for offset 0", async () => {
    const { getWeekDays } = await import("./WeeklyScheduleView");
    const days = getWeekDays(0);
    expect(days).toHaveLength(7);
  });

  it("offset 1 returns dates 7 days after offset 0", async () => {
    const { getWeekDays } = await import("./WeeklyScheduleView");
    const current = getWeekDays(0);
    const next = getWeekDays(1);
    const diff = next[0].getTime() - current[0].getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("offset -1 returns dates 7 days before offset 0", async () => {
    const { getWeekDays } = await import("./WeeklyScheduleView");
    const current = getWeekDays(0);
    const prev = getWeekDays(-1);
    const diff = current[0].getTime() - prev[0].getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("first day is always Monday", async () => {
    const { getWeekDays } = await import("./WeeklyScheduleView");
    for (const offset of [-2, -1, 0, 1, 2]) {
      const days = getWeekDays(offset);
      expect(days[0].getDay()).toBe(1);
    }
  });
});
