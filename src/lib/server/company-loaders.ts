import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  deadlines,
  documents,
} from "@/lib/db/schema";
import {
  COMPANY_LIMITS,
  buildCompanyWhere,
  getViewerPlan,
  serializeCompanyRecord,
  serializeDate,
} from "./loader-helpers";
import { estimateCompanyLogoProfile } from "./company-domain-estimator";
import { getDocumentsPageData } from "./document-loaders";

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
    ]),
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
      ]),
  );

  const result = userCompanies.map((company) => {
    const nearestDeadline = nearestDeadlineMap.get(company.id);
    const appCounts = applicationCountMap.get(company.id) || { total: 0, active: 0 };
    const docCounts = documentCountMap.get(company.id) || { total: 0, esCount: 0 };
    const logoProfile = estimateCompanyLogoProfile(company.name);

    return {
      ...serializeCompanyRecord(company),
      estimatedLogoDomains: logoProfile?.logoDomains ?? [],
      estimatedFaviconUrl: company.corporateUrl ? null : logoProfile?.fallbackFaviconUrl ?? null,
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
    const upcomingDeadlines = appDeadlines.filter((deadline) => deadline.dueDate > now && !deadline.completedAt);
    const nearestDeadline = upcomingDeadlines.toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0] ?? null;

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
