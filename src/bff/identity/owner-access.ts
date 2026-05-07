import { and, eq, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { applications, companies, deadlines, documents, jobTypes } from "@/lib/db/schema";

export interface OwnerIdentity {
  userId: string | null;
  guestId: string | null;
}

interface OwnerRecord {
  userId: string | null;
  guestId: string | null;
}

type OwnedTableColumns = {
  userId: SQLWrapper;
  guestId: SQLWrapper;
};

export function hasValidOwnerIdentity(identity: OwnerIdentity): boolean {
  return Boolean(identity.userId) !== Boolean(identity.guestId);
}

export function buildOwnerCondition(
  table: OwnedTableColumns,
  identity: OwnerIdentity,
): SQL | null {
  if (!hasValidOwnerIdentity(identity)) {
    return null;
  }

  return identity.userId
    ? eq(table.userId, identity.userId)
    : eq(table.guestId, identity.guestId!);
}

export function buildOwnedRowCondition<T extends OwnedTableColumns>(
  idCondition: SQL,
  table: T,
  identity: OwnerIdentity,
): SQL | null {
  const ownerCondition = buildOwnerCondition(table, identity);
  return ownerCondition ? and(idCondition, ownerCondition) ?? null : null;
}

export function buildOwnedDeadlineCondition(deadlineId: string, identity: OwnerIdentity): SQL | null {
  if (!hasValidOwnerIdentity(identity)) {
    return null;
  }

  const ownerPredicate = identity.userId
    ? sql`"deadline_owner"."user_id" = ${identity.userId}`
    : sql`"deadline_owner"."guest_id" = ${identity.guestId}`;

  return and(
    eq(deadlines.id, deadlineId),
    sql`exists (
      select 1
      from "companies" as "deadline_owner"
      where "deadline_owner"."id" = ${deadlines.companyId}
        and ${ownerPredicate}
    )`,
  ) ?? null;
}

export function isOwnedByIdentity(record: OwnerRecord | null | undefined, identity: OwnerIdentity) {
  if (!record || !hasValidOwnerIdentity(identity)) {
    return false;
  }

  if (identity.userId) {
    return record.userId === identity.userId;
  }

  return record.guestId === identity.guestId;
}

export async function hasOwnedCompany(companyId: string, identity: OwnerIdentity): Promise<boolean> {
  const ownerCondition = buildOwnerCondition(companies, identity);
  if (!ownerCondition) {
    return false;
  }

  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.id, companyId),
        ownerCondition
      )
    )
    .limit(1);

  return Boolean(company);
}

export async function getOwnedCompany(
  companyId: string,
  identity: OwnerIdentity
): Promise<{ id: string; name: string; infoFetchedAt: Date | null; corporateInfoFetchedAt: Date | null } | null> {
  const ownerCondition = buildOwnerCondition(companies, identity);
  if (!ownerCondition) {
    return null;
  }

  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      infoFetchedAt: companies.infoFetchedAt,
      corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
    })
    .from(companies)
    .where(
      and(
        eq(companies.id, companyId),
        ownerCondition
      )
    )
    .limit(1);

  return company ?? null;
}

/** Full company row when owned by identity (404 vs 403 aggregation uses caller). */
export async function getOwnedCompanyRecord(
  companyId: string,
  identity: OwnerIdentity,
): Promise<typeof companies.$inferSelect | null> {
  const ownerCondition = buildOwnerCondition(companies, identity);
  if (!ownerCondition) {
    return null;
  }

  const [row] = await db
    .select()
    .from(companies)
    .where(
      and(
        eq(companies.id, companyId),
        ownerCondition,
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function getOwnedDocument(
  documentId: string,
  identity: OwnerIdentity,
): Promise<typeof documents.$inferSelect | null> {
  const condition = buildOwnedRowCondition(eq(documents.id, documentId), documents, identity);
  if (!condition) {
    return null;
  }

  const [doc] = await db.select().from(documents).where(condition).limit(1);
  return doc ?? null;
}

export async function getOwnedApplicationRecord(
  applicationId: string,
  identity: OwnerIdentity,
): Promise<typeof applications.$inferSelect | null> {
  const condition = buildOwnedRowCondition(eq(applications.id, applicationId), applications, identity);
  if (!condition) {
    return null;
  }

  const [app] = await db.select().from(applications).where(condition).limit(1);
  return app ?? null;
}

export async function hasOwnedApplication(applicationId: string, identity: OwnerIdentity): Promise<boolean> {
  const ownerCondition = buildOwnerCondition(applications, identity);
  if (!ownerCondition) {
    return false;
  }

  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        ownerCondition
      )
    )
    .limit(1);

  return Boolean(application);
}

export async function getOwnedApplication(
  applicationId: string,
  identity: OwnerIdentity
): Promise<{ id: string; name: string } | null> {
  const ownerCondition = buildOwnerCondition(applications, identity);
  if (!ownerCondition) {
    return null;
  }

  const [application] = await db
    .select({
      id: applications.id,
      name: applications.name,
    })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        ownerCondition
      )
    )
    .limit(1);

  return application ?? null;
}

export async function hasOwnedJobType(jobTypeId: string, identity: OwnerIdentity): Promise<boolean> {
  if (!hasValidOwnerIdentity(identity)) {
    return false;
  }

  const [jobType] = await db
    .select({ id: jobTypes.id })
    .from(jobTypes)
    .innerJoin(applications, eq(jobTypes.applicationId, applications.id))
    .where(
      and(
        eq(jobTypes.id, jobTypeId),
        identity.userId
          ? eq(applications.userId, identity.userId)
          : eq(applications.guestId, identity.guestId!)
      )
    )
    .limit(1);

  return Boolean(jobType);
}

export async function hasOwnedDeadline(deadlineId: string, identity: OwnerIdentity): Promise<boolean> {
  const condition = buildOwnedDeadlineCondition(deadlineId, identity);
  if (!condition) {
    return false;
  }

  const deadlineCompany = alias(companies, "deadline_company");
  const [deadline] = await db
    .select({ id: deadlines.id })
    .from(deadlines)
    .innerJoin(deadlineCompany, eq(deadlines.companyId, deadlineCompany.id))
    .where(condition)
    .limit(1);

  return Boolean(deadline);
}
