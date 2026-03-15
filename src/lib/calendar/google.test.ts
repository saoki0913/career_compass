import { describe, expect, it } from "vitest";
import {
  buildAppCalendarSummary,
  isAppCalendarEvent,
  stripAppCalendarPrefix,
} from "@/lib/calendar/google";

describe("calendar/google helpers", () => {
  it("normalizes legacy prefixes and typed prefixes", () => {
    expect(stripAppCalendarPrefix("[就活Pass][締切] ES提出")).toBe("ES提出");
    expect(stripAppCalendarPrefix("[シューパス] 企業研究")).toBe("企業研究");
    expect(stripAppCalendarPrefix("[就活Compass][作業] 自己分析")).toBe("自己分析");
  });

  it("builds typed summaries without duplicating prefixes", () => {
    expect(buildAppCalendarSummary("deadline", "[就活Pass] ES提出")).toBe("[就活Pass][締切] ES提出");
    expect(buildAppCalendarSummary("work_block", "[就活Compass][作業] 自己分析")).toBe("[就活Pass][作業] 自己分析");
  });

  it("detects app managed events across all supported prefixes", () => {
    expect(isAppCalendarEvent("[就活Pass][締切] ES提出")).toBe(true);
    expect(isAppCalendarEvent("[シューパス] 面接準備")).toBe(true);
    expect(isAppCalendarEvent("[就活Compass] 企業研究")).toBe(true);
    expect(isAppCalendarEvent("Google Meet")).toBe(false);
  });
});
