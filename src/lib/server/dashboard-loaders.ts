import { and, gte, isNull, lte, eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { RequestIdentity } from "@/bff/identity/request-identity";
import { isOwnedByIdentity } from "@/bff/identity/owner-access";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  deadlines,
  documents,
  gakuchikaContents,
  tasks,
} from "@/lib/db/schema";
import {
  buildCompanyWhere,
  buildDocumentWhere,
  buildTaskWhere,
  serializeDate,
} from "./loader-helpers";

type TodayTaskRow = {
  task: typeof tasks.$inferSelect;
  company: {
    id: string | null;
    name: string | null;
    createdAt: Date | string | null;
    userId: string | null;
    guestId: string | null;
  } | null;
  application: {
    id: string | null;
    name: string | null;
    userId: string | null;
    guestId: string | null;
  } | null;
  deadline: {
    id: string | null;
    title: string | null;
    dueDate: Date | string | null;
    userId: string | null;
    guestId: string | null;
  } | null;
};

type UrgentDeadlineRow = {
  id: string;
  applicationId: string | null;
  dueDate: Date | string;
};

const TODAY_TASK_TYPE_PRIORITY: Record<string, number> = {
  es: 0,
  gakuchika: 1,
  self_analysis: 2,
  web_test: 3,
  video: 4,
  other: 5,
};

function toTimestamp(value: Date | string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return new Date(value).getTime();
}

function compareTimestamps(
  a: Date | string | null | undefined,
  b: Date | string | null | undefined,
) {
  return toTimestamp(a) - toTimestamp(b);
}

function compareTodayTaskType(a: TodayTaskRow, b: TodayTaskRow) {
  return (TODAY_TASK_TYPE_PRIORITY[a.task.type] ?? 5) - (TODAY_TASK_TYPE_PRIORITY[b.task.type] ?? 5);
}

function compareByCreatedAt(a: TodayTaskRow, b: TodayTaskRow) {
  return compareTimestamps(a.task.createdAt, b.task.createdAt);
}

function compareDeadlineWorkOrder(a: TodayTaskRow, b: TodayTaskRow) {
  const sortOrderDiff = (a.task.sortOrder ?? 0) - (b.task.sortOrder ?? 0);
  if (sortOrderDiff !== 0) return sortOrderDiff;

  const dueDateDiff = compareTimestamps(a.task.dueDate, b.task.dueDate);
  if (dueDateDiff !== 0) return dueDateDiff;

  return compareByCreatedAt(a, b);
}

function compareDeepDiveOrder(a: TodayTaskRow, b: TodayTaskRow) {
  const typeDiff = compareTodayTaskType(a, b);
  if (typeDiff !== 0) return typeDiff;

  const companyDiff = compareTimestamps(a.company?.createdAt, b.company?.createdAt);
  if (companyDiff !== 0) return companyDiff;

  return compareByCreatedAt(a, b);
}

function isTaskActionable(row: TodayTaskRow) {
  return row.task.isBlocked !== true;
}

function getDeadlineTargetTasks(deadline: UrgentDeadlineRow, taskRows: TodayTaskRow[]) {
  return taskRows.filter(({ task, deadline: taskDeadline }) => {
    if (deadline.applicationId && task.applicationId === deadline.applicationId) {
      return true;
    }
    return task.deadlineId === deadline.id || taskDeadline?.id === deadline.id;
  });
}

function selectUrgentDeadlineTask(
  taskRows: TodayTaskRow[],
  urgentDeadlines: UrgentDeadlineRow[],
  now: Date,
) {
  let selectedTasks: TodayTaskRow[] = [];
  let highestScore = 0;
  let nearestDue: Date | null = null;

  for (const urgentDeadline of urgentDeadlines) {
    const targetTasks = getDeadlineTargetTasks(urgentDeadline, taskRows);
    if (targetTasks.length === 0) continue;

    const dueDate = new Date(urgentDeadline.dueDate);
    const hoursToDue = Math.max(1, (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    const score = targetTasks.length / hoursToDue;
    const beatsCurrent =
      score > highestScore ||
      (score === highestScore && (!nearestDue || dueDate < nearestDue));

    if (beatsCurrent) {
      highestScore = score;
      nearestDue = dueDate;
      selectedTasks = targetTasks;
    }
  }

  return [...selectedTasks].sort(compareDeadlineWorkOrder)[0] ?? null;
}

function selectDueTask(taskRows: TodayTaskRow[], threshold: Date) {
  return (
    taskRows
      .filter((row) => toTimestamp(row.task.dueDate) <= threshold.getTime())
      .sort((a, b) => {
        const dueDateDiff = compareTimestamps(a.task.dueDate, b.task.dueDate);
        if (dueDateDiff !== 0) return dueDateDiff;

        const typeDiff = compareTodayTaskType(a, b);
        if (typeDiff !== 0) return typeDiff;

        return compareByCreatedAt(a, b);
      })[0] ?? null
  );
}

function selectDeepDiveTask(taskRows: TodayTaskRow[]) {
  return [...taskRows].sort(compareDeepDiveOrder)[0] ?? null;
}

export async function getUpcomingDeadlinesData(identity: RequestIdentity, days = 7) {
  const maxDays = Math.min(Number.isFinite(days) && days > 0 ? days : 7, 30);
  const now = new Date();
  const endDate = new Date(now.getTime());
  endDate.setDate(endDate.getDate() + maxDays);

  const upcomingDeadlines = await db
    .select({
      deadline: deadlines,
      companyName: companies.name,
    })
    .from(deadlines)
    .innerJoin(companies, eq(deadlines.companyId, companies.id))
    .where(
      and(
        buildCompanyWhere(identity),
        gte(deadlines.dueDate, now),
        lte(deadlines.dueDate, endDate),
        isNull(deadlines.completedAt),
      ),
    )
    .orderBy(deadlines.dueDate);

  const formattedDeadlines = upcomingDeadlines.map(({ deadline, companyName }) => {
    const dueDate = new Date(deadline.dueDate);
    return {
      id: deadline.id,
      companyId: deadline.companyId,
      company: companyName || "Unknown",
      type: deadline.type,
      title: deadline.title,
      description: deadline.description,
      dueDate: deadline.dueDate.toISOString(),
      daysLeft: Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      isConfirmed: deadline.isConfirmed,
      confidence: deadline.confidence,
      sourceUrl: deadline.sourceUrl,
    };
  });

  return {
    deadlines: formattedDeadlines,
    count: formattedDeadlines.length,
    periodDays: maxDays,
  };
}

export async function getTodayTaskData(identity: RequestIdentity) {
  const now = new Date();
  const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const deadlineCompany = alias(companies, "today_deadline_company");

  const openTasks: TodayTaskRow[] = await db
    .select({
      task: tasks,
      company: {
        id: companies.id,
        name: companies.name,
        createdAt: companies.createdAt,
        userId: companies.userId,
        guestId: companies.guestId,
      },
      application: {
        id: applications.id,
        name: applications.name,
        userId: applications.userId,
        guestId: applications.guestId,
      },
      deadline: {
        id: deadlines.id,
        title: deadlines.title,
        dueDate: deadlines.dueDate,
        userId: deadlineCompany.userId,
        guestId: deadlineCompany.guestId,
      },
    })
    .from(tasks)
    .leftJoin(companies, eq(tasks.companyId, companies.id))
    .leftJoin(applications, eq(tasks.applicationId, applications.id))
    .leftJoin(deadlines, eq(tasks.deadlineId, deadlines.id))
    .leftJoin(deadlineCompany, eq(deadlines.companyId, deadlineCompany.id))
    .where(and(eq(tasks.status, "open"), buildTaskWhere(identity)));

  if (openTasks.length === 0) {
    return { mode: null, task: null, message: "タスクがありません" };
  }

  const actionableTasks = openTasks.filter(isTaskActionable);
  if (actionableTasks.length === 0) {
    return { mode: null, task: null, message: "今すぐ着手できるタスクがありません" };
  }

  const urgentDeadlines: UrgentDeadlineRow[] = await db
    .select({
      id: deadlines.id,
      applicationId: deadlines.applicationId,
      dueDate: deadlines.dueDate,
    })
    .from(deadlines)
    .innerJoin(companies, eq(deadlines.companyId, companies.id))
    .where(
      and(
        eq(deadlines.isConfirmed, true),
        isNull(deadlines.completedAt),
        lte(deadlines.dueDate, in72h),
        buildCompanyWhere(identity),
      ),
    );

  let selectedTask: TodayTaskRow | null = null;
  let mode: "DEADLINE" | "DEEP_DIVE" = "DEEP_DIVE";

  if (urgentDeadlines.length > 0) {
    selectedTask = selectUrgentDeadlineTask(actionableTasks, urgentDeadlines, now);
    if (selectedTask) {
      mode = "DEADLINE";
    }
  }

  if (!selectedTask) {
    selectedTask = selectDueTask(actionableTasks, in72h);
    if (selectedTask) {
      mode = "DEADLINE";
    }
  }

  if (!selectedTask) {
    selectedTask = selectDeepDiveTask(actionableTasks);
  }

  if (!selectedTask) {
    return { mode: null, task: null, message: "推薦タスクがありません" };
  }

  const serializedDeadlineDueDate = serializeDate(selectedTask.deadline?.dueDate);

  return {
    mode,
    task: {
      ...selectedTask.task,
      dueDate: serializeDate(selectedTask.task.dueDate),
      completedAt: serializeDate(selectedTask.task.completedAt),
      createdAt: serializeDate(selectedTask.task.createdAt) ?? new Date().toISOString(),
      updatedAt:
        serializeDate(selectedTask.task.updatedAt) ?? serializeDate(selectedTask.task.createdAt) ?? new Date().toISOString(),
      sortOrder: selectedTask.task.sortOrder ?? 0,
      company:
        selectedTask.company?.id && selectedTask.company.name && isOwnedByIdentity(selectedTask.company, identity)
          ? { id: selectedTask.company.id, name: selectedTask.company.name }
          : null,
      application:
        selectedTask.application?.id &&
        selectedTask.application.name &&
        isOwnedByIdentity(selectedTask.application, identity)
          ? { id: selectedTask.application.id, name: selectedTask.application.name }
          : null,
      deadline:
        selectedTask.deadline?.id &&
        serializedDeadlineDueDate &&
        isOwnedByIdentity(selectedTask.deadline, identity)
          ? {
              id: selectedTask.deadline.id,
              title: selectedTask.deadline.title ?? "",
              dueDate: serializedDeadlineDueDate,
            }
          : null,
    },
  };
}

export async function getDashboardIncompleteData(identity: RequestIdentity) {
  const draftESDocuments = await db
    .select({
      id: documents.id,
      title: documents.title,
      companyName: companies.name,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .leftJoin(companies, eq(documents.companyId, companies.id))
    .where(and(buildDocumentWhere(identity), eq(documents.status, "draft"), eq(documents.type, "es")))
    .orderBy(desc(documents.updatedAt))
    .limit(5);

  const inProgressGakuchika = await db
    .select({
      id: gakuchikaContents.id,
      title: gakuchikaContents.title,
      updatedAt: gakuchikaContents.updatedAt,
    })
    .from(gakuchikaContents)
    .where(
      and(
        identity.userId
          ? eq(gakuchikaContents.userId, identity.userId)
          : eq(gakuchikaContents.guestId, identity.guestId!),
        isNull(gakuchikaContents.summary),
      ),
    )
    .orderBy(desc(gakuchikaContents.updatedAt))
    .limit(3);

  return {
    draftES: draftESDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      company: document.companyName,
      updatedAt: document.updatedAt?.toISOString(),
    })),
    draftESCount: draftESDocuments.length,
    inProgressGakuchika: inProgressGakuchika.map((gakuchika) => ({
      id: gakuchika.id,
      title: gakuchika.title,
      updatedAt: gakuchika.updatedAt?.toISOString(),
    })),
    inProgressGakuchikaCount: inProgressGakuchika.length,
  };
}
