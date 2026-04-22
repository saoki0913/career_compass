import type { Deadline } from "@/hooks/useCompanyDeadlines";

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export function getDaysUntilDeadline(dueDate: string, now: Date) {
  return Math.ceil((new Date(dueDate).getTime() - now.getTime()) / DAY_IN_MS);
}

export function sortDeadlinesByDueDate(deadlines: Deadline[]) {
  return [...deadlines].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );
}

export function sortCompletedDeadlines(deadlines: Deadline[]) {
  return [...deadlines].sort((a, b) => {
    const aCompletedAt = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const bCompletedAt = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return bCompletedAt - aCompletedAt;
  });
}

export function groupDeadlinesByTimeline(deadlines: Deadline[], now: Date) {
  const overdue: Deadline[] = [];
  const thisWeek: Deadline[] = [];
  const future: Deadline[] = [];
  const completed: Deadline[] = [];

  deadlines.forEach((deadline) => {
    if (deadline.completedAt) {
      completed.push(deadline);
      return;
    }

    const dueDate = new Date(deadline.dueDate);
    if (dueDate < now) {
      overdue.push(deadline);
      return;
    }

    const daysLeft = getDaysUntilDeadline(deadline.dueDate, now);
    if (daysLeft <= 7) {
      thisWeek.push(deadline);
      return;
    }

    future.push(deadline);
  });

  return {
    overdue: sortDeadlinesByDueDate(overdue),
    thisWeek: sortDeadlinesByDueDate(thisWeek),
    future: sortDeadlinesByDueDate(future),
    completed: sortCompletedDeadlines(completed),
  };
}
