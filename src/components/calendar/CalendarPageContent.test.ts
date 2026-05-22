import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";

describe("CalendarPageContent - AddEventModal", () => {
  it("uses notifyError for API failure in catch block", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("notifyError");
  });

  it("keeps inline error banner for validation errors only", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    // Validation errors still use inline display
    expect(source).toContain("タイトルを入力してください");
    expect(source).toContain("終了時刻は開始時刻より後にしてください");
  });
});

describe("CalendarPageContent - responsive calendar safeguards", () => {
  it("separates focused, add-event, and suggestion dates", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("focusedDate");
    expect(source).toContain("addEventDate");
    expect(source).toContain("suggestionDate");
  });

  it("keeps the calendar grid stable at 42 cells", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("while (days.length < 42)");
  });

  it("uses mobile page scrolling instead of the bottom sheet as the primary mobile summary", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("min-h-dvh");
    expect(source).not.toContain("SheetTrigger");
  });

  it("adds explicit labels for the calendar controls", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="前の月を表示"');
    expect(source).toContain('aria-label="次の月を表示"');
    expect(source).toContain('aria-label="エラー通知を閉じる"');
    expect(source).toContain("予定を追加");
  });

  it("keeps focused date aligned when navigating months", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("setFocusedDate(nextDate)");
  });

  it("uses a compact mobile and tablet Google connection strip", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(source).toContain("GoogleCalendarConnectionStrip");
    expect(source).toContain('className="lg:hidden"');
    expect(source).toContain("min-h-10");
  });

  it("shows event title chips inside month cells on mobile and tablet", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("auto-rows-[minmax(5.5rem,auto)]");
    expect(source).toContain("h-6 w-full");
    expect(source).toContain("text-[8px]");
    expect(source).not.toContain("pointer-events-auto hidden h-5");
  });

  it("does not show work block suggestions while Google needs reconnect", async () => {
    const source = await readFile(new URL("./CalendarPageContent.tsx", import.meta.url), "utf8");
    expect(source).toContain("canUseGoogleCalendar");
    expect(source).toContain("if (!canUseGoogleCalendar)");
    expect(source).toContain("setGoogleEvents([])");
  });
});

describe("CalendarSidebar - selected date details", () => {
  it("keeps event time metadata for selected date cards", async () => {
    const source = await readFile(new URL("./CalendarSidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("getDisplayEventTime");
    expect(source).toContain("formatTimeRange(event.startAt, event.endAt)");
    expect(source).toContain('return "終日"');
  });
});

describe("CalendarSkeleton - responsive parity", () => {
  it("uses responsive text width, compact connection strip, and enough summary cards", async () => {
    const source = await readFile(new URL("../skeletons/CalendarSkeleton.tsx", import.meta.url), "utf8");
    expect(source).toContain('widths={["100%"]}');
    expect(source).toContain("min-h-10");
    expect(source).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(source).toContain("Array.from({ length: 4 })");
  });
});
