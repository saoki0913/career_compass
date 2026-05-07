/**
 * Deadline status computation.
 *
 * Priority:
 * 1. statusOverride (if not null) → return that value
 * 2. completedAt (if not null) → "completed"
 * 3. dueDate < now AND completedAt is null → "overdue" (derived only, not in enum)
 * 4. completedTasks > 0 → "in_progress"
 * 5. Otherwise → "not_started"
 */

import { getJstDateKey } from "@/lib/datetime/jst";
import { parseStringArrayCompat } from "@/lib/db/jsonb-compat";

export type DeadlineComputedStatus = "not_started" | "in_progress" | "completed" | "overdue";
export type DeadlinePersistedStatus = Exclude<DeadlineComputedStatus, "overdue">;

export type DeadlineStatusTaskAction =
  | { type: "complete-open-tasks" }
  | { type: "reopen-auto-completed-tasks"; taskIds: string[] }
  | { type: "none" };

export interface DeadlineStatusTransitionPlan {
  completedAt?: Date | null;
  statusOverride?: DeadlinePersistedStatus | null;
  autoCompletedTaskIds?: string[] | null;
  taskAction: DeadlineStatusTaskAction;
}

export function computeDeadlineStatus(params: {
  statusOverride: string | null;
  completedAt: Date | null;
  dueDate: Date;
  completedTasks: number;
  totalTasks: number;
}): DeadlineComputedStatus {
  if (params.statusOverride) {
    return params.statusOverride as DeadlineComputedStatus;
  }

  if (params.completedAt) {
    return "completed";
  }

  if (getJstDateKey(params.dueDate) < getJstDateKey(new Date())) {
    return "overdue";
  }

  if (params.completedTasks > 0) {
    return "in_progress";
  }

  return "not_started";
}

export function planDeadlineStatusTransition(params: {
  current: {
    completedAt: Date | null;
    statusOverride: DeadlinePersistedStatus | null;
    autoCompletedTaskIds: unknown;
  };
  transitionedAt: Date;
  requestedCompletedAt?: Date | null;
  requestedStatusOverride?: DeadlinePersistedStatus | null;
}): DeadlineStatusTransitionPlan {
  const plan: DeadlineStatusTransitionPlan = { taskAction: { type: "none" } };

  if (params.requestedStatusOverride !== undefined) {
    plan.statusOverride = params.requestedStatusOverride;
  }

  const requestedCompletedAt = resolveRequestedCompletedAt(params);
  if (requestedCompletedAt === undefined) {
    return plan;
  }

  plan.completedAt = requestedCompletedAt;

  if (requestedCompletedAt && !params.current.completedAt) {
    plan.taskAction = { type: "complete-open-tasks" };
    plan.autoCompletedTaskIds = [];
    return plan;
  }

  if (requestedCompletedAt === null && params.current.completedAt) {
    const taskIds = parseStringArrayCompat(params.current.autoCompletedTaskIds);
    plan.taskAction = taskIds.length > 0
      ? { type: "reopen-auto-completed-tasks", taskIds }
      : { type: "none" };
    plan.autoCompletedTaskIds = null;
  }

  return plan;
}

export function completeDeadlineStatusTransition(
  plan: DeadlineStatusTransitionPlan,
  params: { autoCompletedTaskIds?: string[] },
): Omit<DeadlineStatusTransitionPlan, "taskAction"> {
  const { taskAction, ...update } = plan;

  if (taskAction.type === "complete-open-tasks") {
    return {
      ...update,
      autoCompletedTaskIds: params.autoCompletedTaskIds ?? [],
    };
  }

  return update;
}

function resolveRequestedCompletedAt(params: {
  current: {
    completedAt: Date | null;
    statusOverride: DeadlinePersistedStatus | null;
  };
  transitionedAt: Date;
  requestedCompletedAt?: Date | null;
  requestedStatusOverride?: DeadlinePersistedStatus | null;
}): Date | null | undefined {
  if (params.requestedCompletedAt !== undefined) {
    return params.requestedCompletedAt;
  }

  if (params.requestedStatusOverride === "completed" && !params.current.completedAt) {
    return params.transitionedAt;
  }

  if (
    params.requestedStatusOverride !== undefined &&
    params.requestedStatusOverride !== "completed" &&
    params.current.completedAt &&
    params.current.statusOverride === "completed"
  ) {
    return null;
  }

  return undefined;
}
