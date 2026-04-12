import { and, gte, isNull, lte, eq, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { isOwnedByIdentity } from "@/app/api/_shared/owner-access";
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

  const openTasks = await db
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

  const urgentDeadlines = await db
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
        gte(deadlines.dueDate, now),
        buildCompanyWhere(identity),
      ),
    );

  let selectedTask = null;
  let mode: "DEADLINE" | "DEEP_DIVE" = "DEEP_DIVE";

  if (urgentDeadlines.length > 0) {
    mode = "DEADLINE";
    const appScores = new Map<string, { score: number; dueDate: Date }>();
    const openTaskCountByApplication = new Map<string, number>();

    for (const { task } of openTasks) {
      if (!task.applicationId) continue;
      openTaskCountByApplication.set(task.applicationId, (openTaskCountByApplication.get(task.applicationId) ?? 0) + 1);
    }

    for (const urgentDeadline of urgentDeadlines) {
      if (!urgentDeadline.applicationId) continue;
      const dueDate = new Date(urgentDeadline.dueDate);
      const hoursToDue = Math.max(1, (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      const score = (openTaskCountByApplication.get(urgentDeadline.applicationId) ?? 0) / hoursToDue;
      const existing = appScores.get(urgentDeadline.applicationId);
      if (!existing || score > existing.score) {
        appScores.set(urgentDeadline.applicationId, { score, dueDate });
      }
    }

    let targetAppId: string | null = null;
    let highestScore = 0;
    let nearestDue: Date | null = null;

    for (const [appId, data] of appScores) {
      if (data.score > highestScore || (data.score === highestScore && nearestDue && data.dueDate < nearestDue)) {
        highestScore = data.score;
        nearestDue = data.dueDate;
        targetAppId = appId;
      }
    }

    if (targetAppId) {
      selectedTask =
        openTasks
          .filter((task) => task.task.applicationId === targetAppId)
          .sort((a, b) => new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime())[0] ?? null;
    }

    if (!selectedTask) {
      selectedTask =
        openTasks
          .filter((task) => task.deadline?.id)
          .sort((a, b) => {
            const aDue = a.deadline?.dueDate ? new Date(a.deadline.dueDate).getTime() : Number.POSITIVE_INFINITY;
            const bDue = b.deadline?.dueDate ? new Date(b.deadline.dueDate).getTime() : Number.POSITIVE_INFINITY;
            return aDue - bDue;
          })[0] ?? null;
    }
  }

  if (!selectedTask) {
    const typePriority: Record<string, number> = {
      es: 0,
      gakuchika: 1,
      self_analysis: 2,
      web_test: 3,
      video: 4,
      other: 5,
    };

    selectedTask =
      [...openTasks].sort((a, b) => {
        const aPriority = typePriority[a.task.type] ?? 5;
        const bPriority = typePriority[b.task.type] ?? 5;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aCompanyCreatedAt = a.company?.createdAt ? new Date(a.company.createdAt).getTime() : Number.POSITIVE_INFINITY;
        const bCompanyCreatedAt = b.company?.createdAt ? new Date(b.company.createdAt).getTime() : Number.POSITIVE_INFINITY;
        if (aCompanyCreatedAt !== bCompanyCreatedAt) return aCompanyCreatedAt - bCompanyCreatedAt;

        return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
      })[0] ?? null;
  }

  if (!selectedTask) {
    return { mode: null, task: null, message: "推薦タスクがありません" };
  }

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
        selectedTask.company?.id && isOwnedByIdentity(selectedTask.company, identity)
          ? { id: selectedTask.company.id, name: selectedTask.company.name }
          : null,
      application:
        selectedTask.application?.id && isOwnedByIdentity(selectedTask.application, identity)
          ? { id: selectedTask.application.id, name: selectedTask.application.name }
          : null,
      deadline:
        selectedTask.deadline?.id &&
        selectedTask.deadline.dueDate &&
        isOwnedByIdentity(selectedTask.deadline, identity)
          ? {
              id: selectedTask.deadline.id,
              title: selectedTask.deadline.title ?? "",
              dueDate: selectedTask.deadline.dueDate.toISOString(),
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
