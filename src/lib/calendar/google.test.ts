import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAppCalendarSummary,
  deleteCalendarEvent,
  isAppCalendarEvent,
  stripAppCalendarPrefix,
} from "@/lib/calendar/google";

describe("calendar/google helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes supported prefixes and typed prefixes", () => {
    expect(stripAppCalendarPrefix("[就活Pass][締切] ES提出")).toBe("ES提出");
    expect(stripAppCalendarPrefix("[シューパス] 企業研究")).toBe("企業研究");
    expect(stripAppCalendarPrefix("[シューパス][作業] 自己分析")).toBe("自己分析");
  });

  it("builds typed summaries without duplicating prefixes", () => {
    expect(buildAppCalendarSummary("deadline", "[就活Pass] ES提出")).toBe("[就活Pass][締切] ES提出");
    expect(buildAppCalendarSummary("work_block", "[シューパス][作業] 自己分析")).toBe("[就活Pass][作業] 自己分析");
  });

  it("detects app managed events across supported prefixes", () => {
    expect(isAppCalendarEvent("[就活Pass][締切] ES提出")).toBe(true);
    expect(isAppCalendarEvent("[シューパス] 面接準備")).toBe(true);
    expect(isAppCalendarEvent("[シューパス] 企業研究")).toBe(true);
    expect(isAppCalendarEvent("Google Meet")).toBe(false);
  });

  it("URL-encodes event IDs when deleting Google Calendar events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deleteCalendarEvent("access-token", "primary/calendar", "evt+/with/slash=");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/primary%2Fcalendar/events/evt%2B%2Fwith%2Fslash%3D",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
