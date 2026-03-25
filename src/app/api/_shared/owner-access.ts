import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { applications, companies, deadlines, jobTypes } from "@/lib/db/schema";

export interface OwnerIdentity {
  userId: string | null;
  guestId: string | null;
}

interface OwnerRecord {
  userId: string | null;
  guestId: string | null;
}

export function isOwnedByIdentity(record: OwnerRecord | null | undefined, identity: OwnerIdentity) {
  if (!record) {
    return false;
  }

  if (identity.userId) {
    return record.userId === identity.userId;
  }

  return record.guestId === identity.guestId;
}

export async function hasOwnedCompany(companyId: string, identity: OwnerIdentity): Promise<boolean> {
  const [company] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.id, companyId),
        identity.userId ? eq(companies.userId, identity.userId) : eq(companies.guestId, identity.guestId!)
      )
    )
    .limit(1);

  return Boolean(company);
}

export async function getOwnedCompany(
  companyId: string,
  identity: OwnerIdentity
): Promise<{ id: string; name: string; infoFetchedAt: Date | null; corporateInfoFetchedAt: Date | null } | null> {
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
        identity.userId ? eq(companies.userId, identity.userId) : eq(companies.guestId, identity.guestId!)
      )
    )
    .limit(1);

  return company ?? null;
}

export async function hasOwnedApplication(applicationId: string, identity: OwnerIdentity): Promise<boolean> {
  const [application] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        identity.userId
          ? eq(applications.userId, identity.userId)
          : eq(applications.guestId, identity.guestId!)
      )
    )
    .limit(1);

  return Boolean(application);
}

export async function getOwnedApplication(
  applicationId: string,
  identity: OwnerIdentity
): Promise<{ id: string; name: string } | null> {
  const [application] = await db
    .select({
      id: applications.id,
      name: applications.name,
    })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        identity.userId
          ? eq(applications.userId, identity.userId)
          : eq(applications.guestId, identity.guestId!)
      )
    )
    .limit(1);

  return application ?? null;
}

export async function hasOwnedJobType(jobTypeId: string, identity: OwnerIdentity): Promise<boolean> {
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
  const deadlineCompany = alias(companies, "deadline_company");
  const [deadline] = await db
    .select({ id: deadlines.id })
    .from(deadlines)
    .innerJoin(deadlineCompany, eq(deadlines.companyId, deadlineCompany.id))
    .where(
      and(
        eq(deadlines.id, deadlineId),
        identity.userId
          ? eq(deadlineCompany.userId, identity.userId)
          : eq(deadlineCompany.guestId, identity.guestId!)
      )
    )
    .limit(1);

  return Boolean(deadline);
}
