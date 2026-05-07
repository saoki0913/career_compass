import { afterEach, describe, expect, it, vi } from "vitest";
import { computeDeadlineStatus } from "./deadline-status";

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe("computeDeadlineStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the statusOverride value when set, ignoring all other fields", () => {
    const result = computeDeadlineStatus({
      statusOverride: "completed",
      completedAt: null,
      dueDate: PAST,
      completedTasks: 0,
      totalTasks: 5,
    });
    expect(result).toBe("completed");
  });

  it("uses any statusOverride string verbatim, including in_progress", () => {
    const result = computeDeadlineStatus({
      statusOverride: "in_progress",
      completedAt: new Date(),
      dueDate: PAST,
      completedTasks: 3,
      totalTasks: 5,
    });
    expect(result).toBe("in_progress");
  });

  it("returns completed when completedAt is set and statusOverride is null", () => {
    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
      dueDate: FUTURE,
      completedTasks: 5,
      totalTasks: 5,
    });
    expect(result).toBe("completed");
  });

  it("returns overdue when dueDate is in the past and completedAt is null", () => {
    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: null,
      dueDate: PAST,
      completedTasks: 0,
      totalTasks: 5,
    });
    expect(result).toBe("overdue");
  });

  it("returns in_progress when completedTasks > 0 with future dueDate and no override", () => {
    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: null,
      dueDate: FUTURE,
      completedTasks: 2,
      totalTasks: 5,
    });
    expect(result).toBe("in_progress");
  });

  it("returns not_started by default when no tasks completed and dueDate is in the future", () => {
    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: null,
      dueDate: FUTURE,
      completedTasks: 0,
      totalTasks: 5,
    });
    expect(result).toBe("not_started");
  });

  it("completedAt takes priority over overdue (past due + completedAt set)", () => {
    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: new Date("2026-01-05T00:00:00.000Z"),
      dueDate: PAST,
      completedTasks: 0,
      totalTasks: 3,
    });
    expect(result).toBe("completed");
  });

  it("returns overdue when dueDate's JST day has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T15:01:00.000Z"));
    const dueDate = new Date("2026-06-15T00:00:00+09:00");

    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: null,
      dueDate,
      completedTasks: 0,
      totalTasks: 5,
    });

    expect(result).toBe("overdue");
  });

  it("returns not_started when dueDate's JST day has not passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T14:59:00.000Z"));
    const dueDate = new Date("2026-06-15T00:00:00+09:00");

    const result = computeDeadlineStatus({
      statusOverride: null,
      completedAt: null,
      dueDate,
      completedTasks: 0,
      totalTasks: 5,
    });

    expect(result).toBe("not_started");
  });
});
