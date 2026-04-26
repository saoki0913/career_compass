import { and, desc, eq, isNotNull, ne } from "drizzle-orm";

import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  documents,
  gakuchikaContents,
  interviewConversations,
  interviewFeedbackHistories,
  jobTypes,
  motivationConversations,
} from "@/lib/db/schema";
import { normalizeInterviewPersistenceError } from "@/lib/interview/persistence-errors";

export type InterviewApplicationContext = {
  applicationTypes: string[];
  applicationRoles: string[];
};

export type InterviewPersistenceRows = {
  activeConversation: typeof interviewConversations.$inferSelect | null;
  feedbackRows: Array<typeof interviewFeedbackHistories.$inferSelect>;
};

export type InterviewContextData = {
  motivationConversation: Array<{
    generatedDraft: string | null;
    messages: unknown;
    selectedRole: string | null;
    selectedRoleSource: string | null;
    desiredWork: string | null;
  }>;
  gakuchikaRows: Array<{ title: string; summary: string | null }>;
  documentRows: Array<{ title: string; content: string | null; esCategory: string | null }>;
  persistence: InterviewPersistenceRows;
  applicationContext: InterviewApplicationContext;
};

export async function getOwnedCompany(companyId: string, identity: RequestIdentity) {
  const [company] = await db
    .select()
    .from(companies)
    .where(
      identity.userId
        ? and(eq(companies.id, companyId), eq(companies.userId, identity.userId))
        : and(eq(companies.id, companyId), eq(companies.guestId, identity.guestId!)),
    )
    .limit(1);

  return company ?? null;
}

async function fetchApplicationContext(
  identity: RequestIdentity,
  companyId: string,
): Promise<InterviewApplicationContext> {
  const rows = await db
    .select({
      applicationType: applications.type,
      jobTypeName: jobTypes.name,
    })
    .from(applications)
    .leftJoin(jobTypes, eq(jobTypes.applicationId, applications.id))
    .where(
      identity.userId
        ? and(eq(applications.companyId, companyId), eq(applications.userId, identity.userId))
        : and(eq(applications.companyId, companyId), eq(applications.guestId, identity.guestId!)),
    );

  return {
    applicationTypes: rows.flatMap((row) => (row.applicationType ? [row.applicationType] : [])),
    applicationRoles: rows
      .map((row) => row.jobTypeName?.trim())
      .filter((value): value is string => Boolean(value)),
  };
}

async function loadInterviewPersistence(
  companyId: string,
  identity: RequestIdentity,
): Promise<InterviewPersistenceRows> {
  const [conversation, feedbackRows] = await Promise.all([
    db
      .select()
      .from(interviewConversations)
      .where(
        identity.userId
          ? and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.userId, identity.userId))
          : and(eq(interviewConversations.companyId, companyId), eq(interviewConversations.guestId, identity.guestId!)),
      )
      .limit(1),
    db
      .select()
      .from(interviewFeedbackHistories)
      .where(
        identity.userId
          ? and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.userId, identity.userId))
          : and(eq(interviewFeedbackHistories.companyId, companyId), eq(interviewFeedbackHistories.guestId, identity.guestId!)),
      )
      .orderBy(desc(interviewFeedbackHistories.createdAt))
      .limit(8),
  ]);

  return {
    activeConversation: conversation[0] ?? null,
    feedbackRows,
  };
}

export async function fetchInterviewContextData(
  companyId: string,
  identity: RequestIdentity,
): Promise<InterviewContextData> {
  const hydrationResults = await Promise.allSettled([
    db
      .select({
        generatedDraft: motivationConversations.generatedDraft,
        messages: motivationConversations.messages,
        selectedRole: motivationConversations.selectedRole,
        selectedRoleSource: motivationConversations.selectedRoleSource,
        desiredWork: motivationConversations.desiredWork,
      })
      .from(motivationConversations)
      .where(
        identity.userId
          ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, identity.userId))
          : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, identity.guestId!)),
      )
      .limit(1),
    db
      .select({
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
      })
      .from(gakuchikaContents)
      .where(
        identity.userId
          ? and(eq(gakuchikaContents.userId, identity.userId), isNotNull(gakuchikaContents.summary))
          : and(eq(gakuchikaContents.guestId, identity.guestId!), isNotNull(gakuchikaContents.summary)),
      )
      .orderBy(desc(gakuchikaContents.updatedAt))
      .limit(3),
    db
      .select({
        title: documents.title,
        content: documents.content,
        esCategory: documents.esCategory,
      })
      .from(documents)
      .where(
        identity.userId
          ? and(
              eq(documents.userId, identity.userId),
              eq(documents.companyId, companyId),
              eq(documents.type, "es"),
              ne(documents.status, "deleted"),
            )
          : and(
              eq(documents.guestId, identity.guestId!),
              eq(documents.companyId, companyId),
              eq(documents.type, "es"),
              ne(documents.status, "deleted"),
            ),
      )
      .orderBy(desc(documents.updatedAt))
      .limit(8),
    loadInterviewPersistence(companyId, identity),
    fetchApplicationContext(identity, companyId),
  ]);

  const rejectedResults = hydrationResults.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  for (const rejected of rejectedResults) {
    const normalized = normalizeInterviewPersistenceError(rejected.reason, {
      companyId,
      operation: "interview:build-context",
    });
    if (normalized) throw normalized;
  }

  if (rejectedResults.length > 0) {
    console.warn(
      `[buildInterviewContext] partial hydration failed: ${rejectedResults.length}/${hydrationResults.length} queries rejected`,
      {
        companyId,
        operation: "interview:build-context",
        reasons: rejectedResults.map((result) =>
          result.reason instanceof Error
            ? { name: result.reason.name, message: result.reason.message }
            : { message: String(result.reason) },
        ),
      },
    );
  }

  const [motivationResult, gakuchikaResult, documentResult, persistenceResult, applicationResult] =
    hydrationResults;

  return {
    motivationConversation: motivationResult.status === "fulfilled" ? motivationResult.value : [],
    gakuchikaRows: gakuchikaResult.status === "fulfilled" ? gakuchikaResult.value : [],
    documentRows: documentResult.status === "fulfilled" ? documentResult.value : [],
    persistence:
      persistenceResult.status === "fulfilled"
        ? persistenceResult.value
        : { activeConversation: null, feedbackRows: [] },
    applicationContext:
      applicationResult.status === "fulfilled"
        ? applicationResult.value
        : { applicationTypes: [], applicationRoles: [] },
  };
}
