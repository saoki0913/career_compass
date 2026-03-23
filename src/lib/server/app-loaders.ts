import { cache } from "react";
import { db } from "@/lib/db";
import {
  aiThreads,
  applications,
  companies,
  creditTransactions,
  deadlines,
  documents,
  gakuchikaContents,
  tasks,
  userProfiles,
} from "@/lib/db/schema";
import { stripCompanyCredentials } from "@/lib/db/sanitize";
import { normalizeEsDocumentCategory } from "@/lib/es-document-category";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";

const COMPANY_LIMITS = {
  guest: 3,
  free: 5,
  standard: Infinity,
  pro: Infinity,
} as const;

type CompanyPlan = keyof typeof COMPANY_LIMITS;

function buildCompanyWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(companies.userId, identity.userId)
    : eq(companies.guestId, identity.guestId!);
}

function buildDocumentWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(documents.userId, identity.userId)
    : eq(documents.guestId, identity.guestId!);
}

function buildTaskWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(tasks.userId, identity.userId)
    : eq(tasks.guestId, identity.guestId!);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function parseDocumentContent(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function serializeCompanyRecord(company: typeof companies.$inferSelect) {
  return {
    ...stripCompanyCredentials(company),
    status: company.status ?? "inbox",
    infoFetchedAt: serializeDate(company.infoFetchedAt),
    corporateInfoFetchedAt: serializeDate(company.corporateInfoFetchedAt),
    createdAt: serializeDate(company.createdAt) ?? new Date().toISOString(),
    updatedAt: serializeDate(company.updatedAt) ?? new Date().toISOString(),
  };
}

const loadViewerPlanForUserId = cache(async (userId: string): Promise<CompanyPlan> => {
  const [profile] = await db
    .select({ plan: userProfiles.plan })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return (profile?.plan as CompanyPlan | undefined) ?? "free";
});

export async function getViewerPlan(identity: RequestIdentity): Promise<CompanyPlan> {
  if (!identity.userId) {
    return "guest";
  }
  return loadViewerPlanForUserId(identity.userId);
}

export async function getCompaniesPageData(identity: RequestIdentity) {
  const plan = await getViewerPlan(identity);
  const limit = COMPANY_LIMITS[plan];
  const whereClause = buildCompanyWhere(identity);

  const userCompanies = await db
    .select()
    .from(companies)
    .where(whereClause)
    .orderBy(desc(companies.isPinned), companies.sortOrder, desc(companies.createdAt));

  if (userCompanies.length === 0) {
    return {
      companies: [],
      count: 0,
      limit: limit === Infinity ? null : limit,
      canAddMore: true,
    };
  }

  const companyIds = userCompanies.map((company) => company.id);
  const now = new Date();

  const [nearestDeadlines, applicationCounts, documentCounts] = await Promise.all([
    db
      .select({
        companyId: deadlines.companyId,
        id: deadlines.id,
        title: deadlines.title,
        dueDate: deadlines.dueDate,
        type: deadlines.type,
      })
      .from(deadlines)
      .where(and(isNull(deadlines.completedAt), inArray(deadlines.companyId, companyIds)))
      .orderBy(asc(deadlines.dueDate)),
    db
      .select({
        companyId: applications.companyId,
        total: count(),
        active: sql<number>`SUM(CASE WHEN ${applications.status} = 'active' THEN 1 ELSE 0 END)`,
      })
      .from(applications)
      .where(inArray(applications.companyId, companyIds))
      .groupBy(applications.companyId),
    db
      .select({
        companyId: documents.companyId,
        total: count(),
        esCount: sql<number>`SUM(CASE WHEN ${documents.type} = 'es' THEN 1 ELSE 0 END)`,
      })
      .from(documents)
      .where(and(inArray(documents.companyId, companyIds), ne(documents.status, "deleted")))
      .groupBy(documents.companyId),
  ]);

  const nearestDeadlineMap = new Map<string, {
    id: string;
    title: string;
    dueDate: Date;
    type: string;
    daysLeft: number;
  }>();
  for (const deadline of nearestDeadlines) {
    if (nearestDeadlineMap.has(deadline.companyId)) {
      continue;
    }

    nearestDeadlineMap.set(deadline.companyId, {
      id: deadline.id,
      title: deadline.title,
      dueDate: deadline.dueDate,
      type: deadline.type,
      daysLeft: Math.ceil((deadline.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    });
  }

  const applicationCountMap = new Map(
    applicationCounts.map((application) => [
      application.companyId,
      {
        total: Number(application.total),
        active: Number(application.active),
      },
    ])
  );

  const documentCountMap = new Map(
    documentCounts
      .filter((documentCount) => documentCount.companyId)
      .map((documentCount) => [
        documentCount.companyId!,
        {
          total: Number(documentCount.total),
          esCount: Number(documentCount.esCount),
        },
      ])
  );

  const result = userCompanies.map((company) => {
    const nearestDeadline = nearestDeadlineMap.get(company.id);
    const appCounts = applicationCountMap.get(company.id) || { total: 0, active: 0 };
    const docCounts = documentCountMap.get(company.id) || { total: 0, esCount: 0 };

    return {
      ...stripCompanyCredentials(company),
      status: company.status ?? "inbox",
      nearestDeadline: nearestDeadline
        ? {
            id: nearestDeadline.id,
            title: nearestDeadline.title,
            dueDate: nearestDeadline.dueDate.toISOString(),
            type: nearestDeadline.type,
            daysLeft: nearestDeadline.daysLeft,
          }
        : null,
      applicationCount: appCounts.total,
      activeApplicationCount: appCounts.active,
      documentCount: docCounts.total,
      esDocumentCount: docCounts.esCount,
    };
  });

  return {
    companies: result,
    count: result.length,
    limit: limit === Infinity ? null : limit,
    canAddMore: result.length < limit,
  };
}

type DocumentsOptions = {
  type?: "es" | "tips" | "company_analysis";
  companyId?: string | null;
  applicationId?: string | null;
  includeDeleted?: boolean;
  /** When false, omit `content` from SQL and return `content: null` (list/cards/API list). Default true. */
  includeContent?: boolean;
};

const documentListJoin = {
  company: {
    id: companies.id,
    name: companies.name,
  },
  application: {
    id: applications.id,
    name: applications.name,
  },
} as const;

const documentRowWithoutContent = {
  id: documents.id,
  userId: documents.userId,
  guestId: documents.guestId,
  companyId: documents.companyId,
  applicationId: documents.applicationId,
  jobTypeId: documents.jobTypeId,
  type: documents.type,
  esCategory: documents.esCategory,
  title: documents.title,
  status: documents.status,
  deletedAt: documents.deletedAt,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
} as const;

export async function getDocumentsPageData(identity: RequestIdentity, options: DocumentsOptions = {}) {
  const includeContent = options.includeContent ?? true;
  const conditions = [buildDocumentWhere(identity)];

  if (options.type) {
    conditions.push(eq(documents.type, options.type));
  }
  if (options.companyId) {
    conditions.push(eq(documents.companyId, options.companyId));
  }
  if (options.applicationId) {
    conditions.push(eq(documents.applicationId, options.applicationId));
  }
  if (!options.includeDeleted) {
    conditions.push(ne(documents.status, "deleted"));
  }

  const whereClause = and(...conditions);

  if (includeContent) {
    const rows = await db
      .select({
        document: documents,
        ...documentListJoin,
      })
      .from(documents)
      .leftJoin(companies, eq(documents.companyId, companies.id))
      .leftJoin(applications, eq(documents.applicationId, applications.id))
      .where(whereClause)
      .orderBy(desc(documents.updatedAt));
    return {
      documents: rows.map((item) => ({
        ...item.document,
        status: item.document.status ?? "draft",
        esCategory: normalizeEsDocumentCategory(item.document.esCategory),
        content: parseDocumentContent(item.document.content),
        deletedAt: item.document.deletedAt ? item.document.deletedAt.toISOString() : null,
        createdAt: item.document.createdAt.toISOString(),
        updatedAt: item.document.updatedAt.toISOString(),
        company: item.company?.id ? item.company : null,
        application: item.application?.id ? item.application : null,
      })),
    };
  }

  const rows = await db
    .select({
      document: documentRowWithoutContent,
      ...documentListJoin,
    })
    .from(documents)
    .leftJoin(companies, eq(documents.companyId, companies.id))
    .leftJoin(applications, eq(documents.applicationId, applications.id))
    .where(whereClause)
    .orderBy(desc(documents.updatedAt));
  return {
    documents: rows.map((item) => ({
      ...item.document,
      status: item.document.status ?? "draft",
      esCategory: normalizeEsDocumentCategory(item.document.esCategory),
      content: null,
      deletedAt: item.document.deletedAt ? item.document.deletedAt.toISOString() : null,
      createdAt: item.document.createdAt.toISOString(),
      updatedAt: item.document.updatedAt.toISOString(),
      company: item.company?.id ? item.company : null,
      application: item.application?.id ? item.application : null,
    })),
  };
}

export async function getEsStats(identity: RequestIdentity) {
  const [totals] = await db
    .select({
      draftCount: sql<number>`SUM(CASE WHEN ${documents.status} = 'draft' THEN 1 ELSE 0 END)`,
      publishedCount: sql<number>`SUM(CASE WHEN ${documents.status} = 'published' THEN 1 ELSE 0 END)`,
    })
    .from(documents)
    .where(and(buildDocumentWhere(identity), eq(documents.type, "es"), ne(documents.status, "deleted")));

  const draftCount = Number(totals?.draftCount ?? 0);
  const publishedCount = Number(totals?.publishedCount ?? 0);

  return {
    draftCount,
    publishedCount,
    total: draftCount + publishedCount,
  };
}

export async function getUpcomingDeadlinesData(identity: RequestIdentity, days = 7) {
  const maxDays = Math.min(Number.isFinite(days) && days > 0 ? days : 7, 30);
  const now = new Date();
  const endDate = new Date(now.getTime());
  endDate.setDate(endDate.getDate() + maxDays);

  const userCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(buildCompanyWhere(identity));

  if (userCompanies.length === 0) {
    return {
      deadlines: [],
      count: 0,
      periodDays: maxDays,
    };
  }

  const companyIds = userCompanies.map((company) => company.id);
  const companyMap = new Map(userCompanies.map((company) => [company.id, company.name]));

  const upcomingDeadlines = await db
    .select()
    .from(deadlines)
    .where(
      and(
        inArray(deadlines.companyId, companyIds),
        gte(deadlines.dueDate, now),
        lte(deadlines.dueDate, endDate),
        isNull(deadlines.completedAt)
      )
    )
    .orderBy(deadlines.dueDate);

  const formattedDeadlines = upcomingDeadlines.map((deadline) => {
    const dueDate = new Date(deadline.dueDate);
    return {
      id: deadline.id,
      companyId: deadline.companyId,
      company: companyMap.get(deadline.companyId) || "Unknown",
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

  const openTasks = await db
    .select({
      task: tasks,
      company: {
        id: companies.id,
        name: companies.name,
        createdAt: companies.createdAt,
      },
      application: {
        id: applications.id,
        name: applications.name,
      },
      deadline: {
        id: deadlines.id,
        title: deadlines.title,
        dueDate: deadlines.dueDate,
      },
    })
    .from(tasks)
    .leftJoin(companies, eq(tasks.companyId, companies.id))
    .leftJoin(applications, eq(tasks.applicationId, applications.id))
    .leftJoin(deadlines, eq(tasks.deadlineId, deadlines.id))
    .where(and(eq(tasks.status, "open"), buildTaskWhere(identity)));

  if (openTasks.length === 0) {
    return {
      mode: null,
      task: null,
      message: "タスクがありません",
    };
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
        buildCompanyWhere(identity)
      )
    );

  let selectedTask = null;
  let mode: "DEADLINE" | "DEEP_DIVE" = "DEEP_DIVE";

  if (urgentDeadlines.length > 0) {
    mode = "DEADLINE";
    const appScores = new Map<string, { score: number; dueDate: Date }>();

    for (const urgentDeadline of urgentDeadlines) {
      if (!urgentDeadline.applicationId) {
        continue;
      }

      const dueDate = new Date(urgentDeadline.dueDate);
      const hoursToDue = Math.max(1, (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      const score = openTasks.filter((task) => task.task.applicationId === urgentDeadline.applicationId).length / hoursToDue;
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
      selectedTask = openTasks
        .filter((task) => task.task.applicationId === targetAppId)
        .sort((a, b) => new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime())[0] ?? null;
    }

    if (!selectedTask) {
      selectedTask = openTasks
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

    selectedTask = [...openTasks].sort((a, b) => {
      const aPriority = typePriority[a.task.type] ?? 5;
      const bPriority = typePriority[b.task.type] ?? 5;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      const aCompanyCreatedAt = a.company?.createdAt ? new Date(a.company.createdAt).getTime() : Number.POSITIVE_INFINITY;
      const bCompanyCreatedAt = b.company?.createdAt ? new Date(b.company.createdAt).getTime() : Number.POSITIVE_INFINITY;
      if (aCompanyCreatedAt !== bCompanyCreatedAt) {
        return aCompanyCreatedAt - bCompanyCreatedAt;
      }

      return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
    })[0] ?? null;
  }

  if (!selectedTask) {
    return {
      mode: null,
      task: null,
      message: "推薦タスクがありません",
    };
  }

  return {
    mode,
    task: {
      ...selectedTask.task,
      dueDate: serializeDate(selectedTask.task.dueDate),
      completedAt: serializeDate(selectedTask.task.completedAt),
      createdAt: serializeDate(selectedTask.task.createdAt) ?? new Date().toISOString(),
      updatedAt: serializeDate(selectedTask.task.updatedAt) ?? serializeDate(selectedTask.task.createdAt) ?? new Date().toISOString(),
      sortOrder: selectedTask.task.sortOrder ?? 0,
      company: selectedTask.company?.id
        ? {
            id: selectedTask.company.id,
            name: selectedTask.company.name,
          }
        : null,
      application: selectedTask.application?.id
        ? {
            id: selectedTask.application.id,
            name: selectedTask.application.name,
          }
        : null,
      deadline: selectedTask.deadline?.id
        ? {
            id: selectedTask.deadline.id,
            title: selectedTask.deadline.title,
            dueDate: selectedTask.deadline.dueDate.toISOString(),
          }
        : null,
    },
  };
}

export async function getActivationData(identity: RequestIdentity) {
  const companyWhere = buildCompanyWhere(identity);
  const documentWhere = buildDocumentWhere(identity);

  const [companyCountRows, deadlineCountRows, esCountRows] = await Promise.all([
    db.select({ count: sql`count(*)` }).from(companies).where(companyWhere),
    db
      .select({ count: sql`count(*)` })
      .from(deadlines)
      .innerJoin(companies, eq(deadlines.companyId, companies.id))
      .where(companyWhere),
    db
      .select({ count: sql`count(*)` })
      .from(documents)
      .where(and(documentWhere, eq(documents.type, "es"), ne(documents.status, "deleted"))),
  ]);

  const aiReviewCount = identity.userId
    ? db
        .select({ count: sql`count(*)` })
        .from(creditTransactions)
        .where(and(eq(creditTransactions.userId, identity.userId), eq(creditTransactions.type, "es_review")))
        .then((rows) => toNumber(rows?.[0]?.count))
    : db
        .select({ count: sql`count(*)` })
        .from(aiThreads)
        .innerJoin(documents, eq(aiThreads.documentId, documents.id))
        .where(and(eq(documents.guestId, identity.guestId!), eq(documents.type, "es"), ne(documents.status, "deleted")))
        .then((rows) => toNumber(rows?.[0]?.count));

  const companyCount = toNumber(companyCountRows[0]?.count);
  const deadlineCount = toNumber(deadlineCountRows[0]?.count);
  const esCount = toNumber(esCountRows[0]?.count);
  const resolvedAiReviewCount = await aiReviewCount;

  const steps = {
    company: {
      label: "企業を1社登録",
      done: companyCount > 0,
      count: companyCount,
      href: "/companies/new",
    },
    deadline: {
      label: "締切を1件追加",
      done: deadlineCount > 0,
      count: deadlineCount,
      href: companyCount > 0 ? "/companies" : "/companies/new",
    },
    es: {
      label: "ESを1件作成",
      done: esCount > 0,
      count: esCount,
      href: "/es?new=1",
    },
    ai_review: {
      label: "AI添削を1回実行",
      done: resolvedAiReviewCount > 0,
      count: resolvedAiReviewCount,
      href: "/es?action=review",
    },
  } as const;

  const ordered = [steps.company, steps.deadline, steps.es, steps.ai_review];
  const nextAction = ordered.find((step) => !step.done) ?? null;

  return {
    steps,
    completedSteps: ordered.filter((step) => step.done).length,
    totalSteps: ordered.length,
    nextAction: nextAction ? { href: nextAction.href, label: nextAction.label } : null,
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
        isNull(gakuchikaContents.summary)
      )
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

export async function getCompanyApplicationsData(identity: RequestIdentity, companyId: string) {
  const appList = await db
    .select({
      application: applications,
    })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(and(eq(applications.companyId, companyId), buildCompanyWhere(identity)))
    .orderBy(applications.sortOrder, desc(applications.createdAt));

  if (appList.length === 0) {
    return [];
  }

  const applicationIds = appList.map((item) => item.application.id);
  const deadlineList = await db
    .select({
      applicationId: deadlines.applicationId,
      id: deadlines.id,
      title: deadlines.title,
      dueDate: deadlines.dueDate,
      type: deadlines.type,
      completedAt: deadlines.completedAt,
    })
    .from(deadlines)
    .where(and(eq(deadlines.companyId, companyId), inArray(deadlines.applicationId, applicationIds)));

  const now = new Date();

  return appList.map(({ application }) => {
    const appDeadlines = deadlineList.filter((deadline) => deadline.applicationId === application.id);
    const upcomingDeadlines = appDeadlines.filter(
      (deadline) => deadline.dueDate > now && !deadline.completedAt
    );
    const nearestDeadline = upcomingDeadlines
      .toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;

    return {
      ...application,
      phase: application.phase ? JSON.parse(application.phase) : [],
      deadlineCount: appDeadlines.length,
      nearestDeadline: nearestDeadline ? nearestDeadline.dueDate.toISOString() : null,
      sortOrder: application.sortOrder ?? 0,
      createdAt: serializeDate(application.createdAt) ?? new Date().toISOString(),
      updatedAt: serializeDate(application.updatedAt) ?? new Date().toISOString(),
    };
  });
}

export async function getCompanyDeadlinesData(identity: RequestIdentity, companyId: string) {
  const companyDeadlines = await db
    .select({
      deadline: deadlines,
    })
    .from(deadlines)
    .innerJoin(companies, eq(deadlines.companyId, companies.id))
    .where(and(eq(deadlines.companyId, companyId), buildCompanyWhere(identity)))
    .orderBy(deadlines.dueDate);

  return companyDeadlines.map(({ deadline }) => ({
    id: deadline.id,
    companyId: deadline.companyId,
    type: deadline.type,
    title: deadline.title,
    description: deadline.description,
    memo: deadline.memo,
    dueDate: serializeDate(deadline.dueDate) ?? new Date().toISOString(),
    isConfirmed: deadline.isConfirmed,
    confidence: deadline.confidence,
    sourceUrl: deadline.sourceUrl,
    completedAt: serializeDate(deadline.completedAt),
    createdAt: serializeDate(deadline.createdAt) ?? new Date().toISOString(),
    updatedAt: serializeDate(deadline.updatedAt) ?? new Date().toISOString(),
  }));
}

export async function getCompanyDetailPageData(identity: RequestIdentity, companyId: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), buildCompanyWhere(identity)))
    .limit(1);

  if (!company) {
    return null;
  }

  const [applicationsData, deadlinesData, documentsData] = await Promise.all([
    getCompanyApplicationsData(identity, companyId),
    getCompanyDeadlinesData(identity, companyId),
    getDocumentsPageData(identity, {
      companyId,
      type: "es",
      includeDeleted: false,
      includeContent: false,
    }),
  ]);

  return {
    company: serializeCompanyRecord(company),
    applications: applicationsData,
    deadlines: deadlinesData,
    esDocuments: documentsData.documents,
  };
}

async function loadDocumentDetailPageData(
  documentId: string,
  userId: string | null,
  guestId: string | null
) {
  const identity: RequestIdentity = userId
    ? { userId, guestId: null }
    : { userId: null, guestId: guestId! };

  const [item] = await db
    .select({
      document: documents,
      company: {
        id: companies.id,
        name: companies.name,
        infoFetchedAt: companies.infoFetchedAt,
        corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
      },
      application: {
        id: applications.id,
        name: applications.name,
      },
    })
    .from(documents)
    .leftJoin(companies, eq(documents.companyId, companies.id))
    .leftJoin(applications, eq(documents.applicationId, applications.id))
    .where(and(eq(documents.id, documentId), buildDocumentWhere(identity)))
    .limit(1);

  if (!item) {
    return null;
  }

  return {
    document: {
      ...item.document,
      status: item.document.status ?? "draft",
      esCategory: normalizeEsDocumentCategory(item.document.esCategory),
      content: parseDocumentContent(item.document.content),
      deletedAt: serializeDate(item.document.deletedAt),
      createdAt: serializeDate(item.document.createdAt) ?? new Date().toISOString(),
      updatedAt: serializeDate(item.document.updatedAt) ?? new Date().toISOString(),
      company: item.company?.id
        ? {
            ...item.company,
            infoFetchedAt: serializeDate(item.company.infoFetchedAt),
            corporateInfoFetchedAt: serializeDate(item.company.corporateInfoFetchedAt),
          }
        : null,
      application: item.application?.id ? item.application : null,
    },
  };
}

const loadDocumentDetailPageDataCached = cache(loadDocumentDetailPageData);

export async function getDocumentDetailPageData(identity: RequestIdentity, documentId: string) {
  const { userId, guestId } = identity;
  if (!userId && !guestId) {
    return null;
  }
  return loadDocumentDetailPageDataCached(documentId, userId, guestId);
}
