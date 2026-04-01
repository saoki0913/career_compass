import { alias } from "drizzle-orm/pg-core";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, companies, deadlines, tasks } from "@/lib/db/schema";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { isOwnedByIdentity } from "@/app/api/_shared/owner-access";

type TaskStatusFilter = "open" | "done" | "all";

function buildTaskWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(tasks.userId, identity.userId)
    : eq(tasks.guestId, identity.guestId!);
}

function serializeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

export async function getTasksPageData(
  identity: RequestIdentity,
  options: {
    status?: TaskStatusFilter;
    companyId?: string | null;
    applicationId?: string | null;
  } = {}
) {
  const deadlineCompany = alias(companies, "tasks_deadline_company");
  const conditions = [buildTaskWhere(identity)];

  if (options.status && options.status !== "all") {
    conditions.push(eq(tasks.status, options.status));
  }
  if (options.companyId) {
    conditions.push(eq(tasks.companyId, options.companyId));
  }
  if (options.applicationId) {
    conditions.push(eq(tasks.applicationId, options.applicationId));
  }

  const taskList = await db
    .select({
      task: tasks,
      company: {
        id: companies.id,
        name: companies.name,
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
    .where(and(...conditions))
    .orderBy(asc(tasks.status), asc(tasks.dueDate), desc(tasks.createdAt));

  return {
    tasks: taskList.map(({ task, company, application, deadline }) => ({
      ...task,
      dueDate: serializeDate(task.dueDate),
      completedAt: serializeDate(task.completedAt),
      createdAt: serializeDate(task.createdAt) ?? new Date().toISOString(),
      updatedAt: serializeDate(task.updatedAt) ?? serializeDate(task.createdAt) ?? new Date().toISOString(),
      sortOrder: task.sortOrder ?? 0,
      company:
        company?.id && isOwnedByIdentity(company, identity)
          ? { id: company.id, name: company.name }
          : null,
      application:
        application?.id && isOwnedByIdentity(application, identity)
          ? { id: application.id, name: application.name }
          : null,
      deadline:
        deadline?.id && deadline.dueDate && isOwnedByIdentity(deadline, identity)
          ? { id: deadline.id, title: deadline.title ?? "", dueDate: deadline.dueDate.toISOString() }
          : null,
    })),
  };
}
