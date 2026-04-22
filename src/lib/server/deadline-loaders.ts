/**
 * Deadline dashboard data loader.
 *
 * Fetches deadlines with company info and task progress, computes status,
 * and provides filtering/sorting/summary capabilities.
 */

import { db } from "@/lib/db";
import { deadlines, companies, tasks } from "@/lib/db/schema";
import { eq, and, sql, asc, desc } from "drizzle-orm";
import { computeDeadlineStatus, type DeadlineComputedStatus } from "./deadline-status";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";

export interface DeadlineDashboardItem {
  id: string;
  companyId: string;
  companyName: string;
  type: string;
  title: string;
  dueDate: string;
  status: DeadlineComputedStatus;
  statusOverride: string | null;
  isConfirmed: boolean;
  completedAt: string | null;
  totalTasks: number;
  completedTasks: number;
  createdAt: string;
}

export interface DeadlineDashboardSummary {
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  overdue: number;
  completionRate: number;
}

export interface DeadlineDashboardData {
  deadlines: DeadlineDashboardItem[];
  summary: DeadlineDashboardSummary;
}

export interface DeadlineDashboardFilters {
  status?: DeadlineComputedStatus;
  type?: string;
  companyId?: string;
  search?: string;
  sort?: "dueDate" | "company" | "type";
  sortDir?: "asc" | "desc";
}

export async function getDeadlinesDashboardData(
  identity: RequestIdentity,
  filters: DeadlineDashboardFilters = {},
): Promise<DeadlineDashboardData> {
  const ownerCondition = identity.userId
    ? eq(companies.userId, identity.userId)
    : identity.guestId
      ? eq(companies.guestId, identity.guestId)
      : null;

  if (!ownerCondition) {
    return { deadlines: [], summary: { total: 0, notStarted: 0, inProgress: 0, completed: 0, overdue: 0, completionRate: 0 } };
  }

  // Fetch all confirmed deadlines with company info
  const rows = await db
    .select({
      deadline: deadlines,
      companyName: companies.name,
      companyId: companies.id,
      totalTasks: sql<number>`(select count(*) from ${tasks} where ${tasks.deadlineId} = ${deadlines.id})`,
      completedTasks: sql<number>`(select count(*) from ${tasks} where ${tasks.deadlineId} = ${deadlines.id} and ${tasks.status} = 'done')`,
    })
    .from(deadlines)
    .innerJoin(companies, eq(deadlines.companyId, companies.id))
    .where(and(ownerCondition, eq(deadlines.isConfirmed, true)));

  // Compute status and build items
  let items: DeadlineDashboardItem[] = rows.map((row) => {
    const status = computeDeadlineStatus({
      statusOverride: row.deadline.statusOverride,
      completedAt: row.deadline.completedAt,
      dueDate: row.deadline.dueDate,
      completedTasks: Number(row.completedTasks ?? 0),
      totalTasks: Number(row.totalTasks ?? 0),
    });

    return {
      id: row.deadline.id,
      companyId: row.companyId,
      companyName: row.companyName,
      type: row.deadline.type,
      title: row.deadline.title,
      dueDate: row.deadline.dueDate.toISOString(),
      status,
      statusOverride: row.deadline.statusOverride,
      isConfirmed: row.deadline.isConfirmed,
      completedAt: row.deadline.completedAt?.toISOString() ?? null,
      totalTasks: Number(row.totalTasks ?? 0),
      completedTasks: Number(row.completedTasks ?? 0),
      createdAt: row.deadline.createdAt.toISOString(),
    };
  });

  // Apply filters
  if (filters.status) {
    items = items.filter((d) => d.status === filters.status);
  }
  if (filters.type) {
    items = items.filter((d) => d.type === filters.type);
  }
  if (filters.companyId) {
    items = items.filter((d) => d.companyId === filters.companyId);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    items = items.filter(
      (d) => d.title.toLowerCase().includes(q) || d.companyName.toLowerCase().includes(q),
    );
  }

  // Sort
  const dir = filters.sortDir === "desc" ? -1 : 1;
  if (filters.sort === "company") {
    items.sort((a, b) => dir * a.companyName.localeCompare(b.companyName));
  } else if (filters.sort === "type") {
    items.sort((a, b) => dir * a.type.localeCompare(b.type));
  } else {
    // Default: sort by dueDate
    items.sort((a, b) => dir * (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()));
  }

  // Compute summary from ALL items (before status filter)
  const allItems = rows.map((row) =>
    computeDeadlineStatus({
      statusOverride: row.deadline.statusOverride,
      completedAt: row.deadline.completedAt,
      dueDate: row.deadline.dueDate,
      completedTasks: Number(row.completedTasks ?? 0),
      totalTasks: Number(row.totalTasks ?? 0),
    }),
  );

  const summary: DeadlineDashboardSummary = {
    total: allItems.length,
    notStarted: allItems.filter((s) => s === "not_started").length,
    inProgress: allItems.filter((s) => s === "in_progress").length,
    completed: allItems.filter((s) => s === "completed").length,
    overdue: allItems.filter((s) => s === "overdue").length,
    completionRate: allItems.length > 0
      ? Math.round((allItems.filter((s) => s === "completed").length / allItems.length) * 100)
      : 0,
  };

  return { deadlines: items, summary };
}
