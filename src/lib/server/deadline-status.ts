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

export type DeadlineComputedStatus = "not_started" | "in_progress" | "completed" | "overdue";

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

  if (params.dueDate < new Date()) {
    return "overdue";
  }

  if (params.completedTasks > 0) {
    return "in_progress";
  }

  return "not_started";
}
