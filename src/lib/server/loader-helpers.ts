import { cache } from "react";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  documents,
  tasks,
  userProfiles,
} from "@/lib/db/schema";
import { stripCompanyCredentials } from "@/lib/db/sanitize";

export const COMPANY_LIMITS = {
  guest: 3,
  free: 5,
  standard: Infinity,
  pro: Infinity,
} as const;

export type CompanyPlan = keyof typeof COMPANY_LIMITS;

export function buildCompanyWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(companies.userId, identity.userId)
    : eq(companies.guestId, identity.guestId!);
}

export function buildDocumentWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(documents.userId, identity.userId)
    : eq(documents.guestId, identity.guestId!);
}

export function buildTaskWhere(identity: RequestIdentity) {
  return identity.userId
    ? eq(tasks.userId, identity.userId)
    : eq(tasks.guestId, identity.guestId!);
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

export function parseDocumentContent(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function serializeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

export function serializeCompanyRecord(company: typeof companies.$inferSelect) {
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
