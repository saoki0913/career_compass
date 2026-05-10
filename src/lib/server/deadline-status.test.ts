import { afterEach, describe, expect, it, vi } from "vitest";
import {
  completeDeadlineStatusTransition,
  computeDeadlineStatus,
  planDeadlineStatusTransition,
} from "./deadline-status";

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

describe("planDeadlineStatusTransition", () => {
  const transitionedAt = new Date("2026-03-21T00:00:00.000Z");

  it("marks a deadline complete and requests open task completion", () => {
    const completedAt = new Date("2026-03-20T00:00:00.000Z");

    const plan = planDeadlineStatusTransition({
      current: {
        completedAt: null,
        statusOverride: null,
        autoCompletedTaskIds: null,
      },
      transitionedAt,
      requestedCompletedAt: completedAt,
    });

    expect(plan).toEqual({
      completedAt,
      autoCompletedTaskIds: [],
      taskAction: { type: "complete-open-tasks" },
    });

    expect(completeDeadlineStatusTransition(plan, { autoCompletedTaskIds: ["task-1"] })).toEqual({
      completedAt,
      autoCompletedTaskIds: ["task-1"],
    });
  });

  it("unmarks a completed deadline and reopens only stored auto-completed tasks", () => {
    const plan = planDeadlineStatusTransition({
      current: {
        completedAt: new Date("2026-03-20T00:00:00.000Z"),
        statusOverride: null,
        autoCompletedTaskIds: ["task-1", "task-2"],
      },
      transitionedAt,
      requestedCompletedAt: null,
    });

    expect(plan).toEqual({
      completedAt: null,
      autoCompletedTaskIds: null,
      taskAction: { type: "reopen-auto-completed-tasks", taskIds: ["task-1", "task-2"] },
    });
  });

  it("status override completed sets completedAt using the transition timestamp", () => {
    const plan = planDeadlineStatusTransition({
      current: {
        completedAt: null,
        statusOverride: null,
        autoCompletedTaskIds: null,
      },
      transitionedAt,
      requestedStatusOverride: "completed",
    });

    expect(plan).toEqual({
      completedAt: transitionedAt,
      statusOverride: "completed",
      autoCompletedTaskIds: [],
      taskAction: { type: "complete-open-tasks" },
    });
  });

  it("clearing a completed override clears completion and reopens tracked tasks", () => {
    const plan = planDeadlineStatusTransition({
      current: {
        completedAt: new Date("2026-03-20T00:00:00.000Z"),
        statusOverride: "completed",
        autoCompletedTaskIds: ["task-1"],
      },
      transitionedAt,
      requestedStatusOverride: "in_progress",
    });

    expect(plan).toEqual({
      completedAt: null,
      statusOverride: "in_progress",
      autoCompletedTaskIds: null,
      taskAction: { type: "reopen-auto-completed-tasks", taskIds: ["task-1"] },
    });
  });

  it("non-completed override does not clear a manually completed deadline", () => {
    const plan = planDeadlineStatusTransition({
      current: {
        completedAt: new Date("2026-03-20T00:00:00.000Z"),
        statusOverride: null,
        autoCompletedTaskIds: ["task-1"],
      },
      transitionedAt,
      requestedStatusOverride: "in_progress",
    });

    expect(plan).toEqual({
      statusOverride: "in_progress",
      taskAction: { type: "none" },
    });
  });
});
