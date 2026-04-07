import { and, eq, type SQL } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import type { ProfileContext } from "@/lib/ai/user-context";
import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  jobTypes,
  motivationConversations,
} from "@/lib/db/schema";
import {
  getMotivationConversationByCondition,
  type MotivationConversationContext as BaseMotivationConversationContext,
} from "@/lib/motivation/conversation";

export type MotivationConversationContext = BaseMotivationConversationContext;

export interface MotivationCompanyData {
  id: string;
  name: string;
  industry: string | null;
}

export interface MotivationEvidenceCard {
  sourceId: string;
  title: string;
  contentType: string;
  excerpt: string;
  sourceUrl: string;
  relevanceLabel: string;
}

export interface MotivationResolvedInputs {
  company: MotivationCompanyData;
  conversationContext: MotivationConversationContext;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  companyRoleCandidates: string[];
}

function uniqueStrings(values: Array<string | null | undefined>, maxItems = 8): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) {
      break;
    }
  }

  return output;
}

export function buildMotivationOwnerCondition(
  companyId: string,
  userId: string | null,
  guestId: string | null,
): SQL<unknown> {
  return userId
    ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
    : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!));
}

export async function ensureMotivationConversation(
  companyId: string,
  userId: string | null,
  guestId: string | null,
) {
  const ownerCondition = buildMotivationOwnerCondition(companyId, userId, guestId);
  let conversation = await getMotivationConversationByCondition(ownerCondition);

  if (!conversation) {
    const now = new Date();
    const baseConversation = {
      id: crypto.randomUUID(),
      userId,
      guestId: userId ? null : guestId,
      companyId,
      messages: "[]",
      questionCount: 0,
      status: "in_progress" as const,
      createdAt: now,
      updatedAt: now,
    };

    if (userId) {
      await db.insert(motivationConversations).values(baseConversation).onConflictDoNothing({
        target: [motivationConversations.companyId, motivationConversations.userId],
      });
    } else {
      await db.insert(motivationConversations).values(baseConversation).onConflictDoNothing({
        target: [motivationConversations.companyId, motivationConversations.guestId],
      });
    }

    conversation = await getMotivationConversationByCondition(ownerCondition);
  }

  return conversation;
}

export async function getOwnedMotivationCompanyData(
  companyId: string,
  identity: RequestIdentity,
): Promise<MotivationCompanyData | null> {
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
      industry: companies.industry,
    })
    .from(companies)
    .where(
      identity.userId
        ? and(eq(companies.id, companyId), eq(companies.userId, identity.userId))
        : and(eq(companies.id, companyId), eq(companies.guestId, identity.guestId!)),
    )
    .limit(1);

  return company ?? null;
}

export async function fetchMotivationApplicationJobCandidates(
  companyId: string,
  userId: string | null,
  guestId: string | null,
): Promise<string[]> {
  const rows = await db
    .select({
      jobTypeName: jobTypes.name,
    })
    .from(applications)
    .leftJoin(jobTypes, eq(jobTypes.applicationId, applications.id))
    .where(
      userId
        ? and(eq(applications.companyId, companyId), eq(applications.userId, userId))
        : and(eq(applications.companyId, companyId), eq(applications.guestId, guestId!)),
    );

  const candidates: string[] = [];
  for (const row of rows) {
    const value = row.jobTypeName?.trim();
    if (value && !candidates.includes(value)) {
      candidates.push(value);
    }
  }

  return candidates.slice(0, 6);
}

export function resolveMotivationInputs(
  company: MotivationCompanyData,
  conversationContext: MotivationConversationContext,
  applicationJobCandidates: string[],
): MotivationResolvedInputs {
  const resolution = resolveMotivationRoleContext({
    companyName: company.name,
    companyIndustry: company.industry,
    selectedIndustry: conversationContext.selectedIndustry,
    applicationRoles: applicationJobCandidates,
  });

  const nextContext: MotivationConversationContext = {
    ...conversationContext,
    selectedIndustry: conversationContext.selectedIndustry || resolution.resolvedIndustry || undefined,
    selectedIndustrySource:
      conversationContext.selectedIndustrySource ||
      resolution.industrySource ||
      undefined,
    companyRoleCandidates: uniqueStrings([
      ...(conversationContext.companyRoleCandidates ?? []),
      ...resolution.roleCandidates,
    ]),
  };

  return {
    company: {
      ...company,
      industry: resolution.resolvedIndustry ?? company.industry,
    },
    conversationContext: nextContext,
    requiresIndustrySelection: Boolean(resolution.requiresIndustrySelection),
    industryOptions: [...(resolution.industryOptions ?? [])],
    companyRoleCandidates: resolution.roleCandidates ?? [],
  };
}

export function isMotivationSetupComplete(
  conversationContext: MotivationConversationContext,
  requiresIndustrySelection: boolean,
): boolean {
  const hasIndustry = !requiresIndustrySelection || Boolean(conversationContext.selectedIndustry);
  return hasIndustry && Boolean(conversationContext.selectedRole);
}

export function resolveMotivationRoleSelectionSource(
  selectedRole: string,
  profileContext: ProfileContext | null,
  applicationJobCandidates: string[],
  companyRoleCandidates: string[],
  explicitSource?: string | null,
): MotivationConversationContext["selectedRoleSource"] {
  if (
    explicitSource === "profile" ||
    explicitSource === "company_doc" ||
    explicitSource === "application_job_type" ||
    explicitSource === "user_free_text"
  ) {
    return explicitSource;
  }
  if (applicationJobCandidates.includes(selectedRole)) {
    return "application_job_type";
  }
  if (profileContext?.target_job_types.includes(selectedRole)) {
    return "profile";
  }
  if (companyRoleCandidates.includes(selectedRole)) {
    return "company_doc";
  }
  return "user_free_text";
}

export function buildMotivationEvidenceSummaryFromCards(
  cards: MotivationEvidenceCard[],
): string | null {
  if (cards.length === 0) {
    return null;
  }
  return cards
    .slice(0, 2)
    .map((card) => `${card.sourceId} ${card.title}: ${card.excerpt}`)
    .join(" / ");
}
