import { randomUUID, timingSafeEqual } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  creditTransactions,
  credits,
  gakuchikaContents,
  interviewConversations,
  interviewFeedbackHistories,
  motivationConversations,
  userProfiles,
  users,
} from "@/lib/db/schema";
import type { PlanType } from "@/lib/stripe/config";

const DEFAULT_TEST_EMAIL = "ci-e2e-user@shupass.jp";
const DEFAULT_TEST_NAME = "CI E2E User";
const DEFAULT_TEST_PLAN: PlanType = "standard";
export const CI_E2E_LIVE_SEED_CREDITS = 1000;

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CiE2ETestUser = {
  userId: string;
  email: string;
  name: string;
  plan: PlanType;
};

export type CiE2ELiveStateResetResult = {
  userId: string;
  creditBalance: number;
  deletedCounts: {
    companies: number;
    gakuchikaContents: number;
    motivationConversationsDeleted: number;
    motivationConversationsReset: number;
    interviewConversationsDeleted: number;
    interviewConversationsReset: number;
    interviewFeedbackHistories: number;
    interviewTurnEvents: number;
    creditTransactionsDeleted: number;
  };
};

function resolveTestUserConfig(): Omit<CiE2ETestUser, "userId"> {
  const email = process.env.CI_E2E_TEST_EMAIL?.trim() || DEFAULT_TEST_EMAIL;
  const name = process.env.CI_E2E_TEST_NAME?.trim() || DEFAULT_TEST_NAME;
  const requestedPlan = process.env.CI_E2E_TEST_PLAN?.trim();
  const plan: PlanType =
    requestedPlan === "free" || requestedPlan === "standard" || requestedPlan === "pro"
      ? requestedPlan
      : DEFAULT_TEST_PLAN;

  return { email, name, plan };
}

export function parseBearerSecret(headerValue: string | null | undefined) {
  const header = headerValue?.trim();
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export function hasMatchingSecret(expected: string, actual: string | null) {
  if (!actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function ensureCiE2ETestUser() {
  return db.transaction(async (tx) => ensureCiE2ETestUserWithTx(tx));
}

export async function ensureCiE2ETestUserWithTx(tx: DatabaseTransaction): Promise<CiE2ETestUser> {
  const { email, name, plan } = resolveTestUserConfig();
  const now = new Date();

  const [existingUser] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
  const userId = existingUser?.id ?? randomUUID();

  if (existingUser) {
    await tx
      .update(users)
      .set({
        name,
        emailVerified: true,
        updatedAt: now,
      })
      .where(eq(users.id, existingUser.id));
  } else {
    await tx.insert(users).values({
      id: userId,
      email,
      name,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [existingProfile] = await tx
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (existingProfile) {
    await tx
      .update(userProfiles)
      .set({
        plan,
        planSelectedAt: existingProfile.planSelectedAt ?? now,
        onboardingCompleted: true,
        updatedAt: now,
      })
      .where(eq(userProfiles.userId, userId));
  } else {
    await tx.insert(userProfiles).values({
      id: randomUUID(),
      userId,
      plan,
      planSelectedAt: now,
      onboardingCompleted: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    userId,
    email,
    name,
    plan,
  };
}

function isAiLiveCompanyName(name: string) {
  return name.includes("_live-ai-conversations-") || name.startsWith("AI添削会社_live-es-");
}

export async function resetCiE2ELiveState(userId: string): Promise<CiE2ELiveStateResetResult> {
  return db.transaction(async (tx) => {
    const now = new Date();

    const ownedCompanies = await tx
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.userId, userId));
    const liveCompanyIds = ownedCompanies.filter((company) => isAiLiveCompanyName(company.name)).map((company) => company.id);

    const motivationRows = await tx
      .select({ id: motivationConversations.id, companyId: motivationConversations.companyId })
      .from(motivationConversations)
      .where(eq(motivationConversations.userId, userId));
    const liveMotivationIds = motivationRows
      .filter((row) => liveCompanyIds.includes(row.companyId))
      .map((row) => row.id);
    const retainedMotivationIds = motivationRows
      .filter((row) => !liveCompanyIds.includes(row.companyId))
      .map((row) => row.id);

    const interviewRows = await tx
      .select({ id: interviewConversations.id, companyId: interviewConversations.companyId })
      .from(interviewConversations)
      .where(eq(interviewConversations.userId, userId));
    const liveInterviewIds = interviewRows
      .filter((row) => liveCompanyIds.includes(row.companyId))
      .map((row) => row.id);
    const retainedInterviewIds = interviewRows
      .filter((row) => !liveCompanyIds.includes(row.companyId))
      .map((row) => row.id);
    const allInterviewIds = interviewRows.map((row) => row.id);

    const deletedCreditTransactions = await tx
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .returning({ id: creditTransactions.id });

    const deletedGakuchikaContents = await tx
      .delete(gakuchikaContents)
      .where(eq(gakuchikaContents.userId, userId))
      .returning({ id: gakuchikaContents.id });

    const deletedMotivationConversations =
      liveMotivationIds.length > 0
        ? await tx
            .delete(motivationConversations)
            .where(
              and(
                eq(motivationConversations.userId, userId),
                inArray(motivationConversations.id, liveMotivationIds),
              ),
            )
            .returning({ id: motivationConversations.id })
        : [];

    const resetMotivationConversations =
      retainedMotivationIds.length > 0
        ? await tx
            .update(motivationConversations)
            .set({
              messages: "[]",
              questionCount: 0,
              status: "in_progress",
              motivationScores: null,
              generatedDraft: null,
              charLimitType: null,
              conversationContext: null,
              selectedRole: null,
              selectedRoleSource: null,
              desiredWork: null,
              questionStage: null,
              lastSuggestions: null,
              lastSuggestionOptions: null,
              lastEvidenceCards: null,
              stageStatus: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(motivationConversations.userId, userId),
                inArray(motivationConversations.id, retainedMotivationIds),
              ),
            )
            .returning({ id: motivationConversations.id })
        : [];

    const deletedInterviewFeedbackHistories =
      allInterviewIds.length > 0
        ? await tx
            .delete(interviewFeedbackHistories)
            .where(
              and(
                eq(interviewFeedbackHistories.userId, userId),
                inArray(interviewFeedbackHistories.conversationId, allInterviewIds),
              ),
            )
            .returning({ id: interviewFeedbackHistories.id })
        : [];

    const deletedInterviewConversations =
      liveInterviewIds.length > 0
        ? await tx
            .delete(interviewConversations)
            .where(
              and(
                eq(interviewConversations.userId, userId),
                inArray(interviewConversations.id, liveInterviewIds),
              ),
            )
            .returning({ id: interviewConversations.id })
        : [];

    const resetInterviewConversations =
      retainedInterviewIds.length > 0
        ? await tx
            .update(interviewConversations)
            .set({
              messages: "[]",
              status: "setup_pending",
              currentStage: "setup",
              questionCount: 0,
              stageQuestionCounts: JSON.stringify({}),
              completedStages: JSON.stringify([]),
              lastQuestionFocus: null,
              questionFlowCompleted: false,
              selectedIndustry: null,
              selectedRole: null,
              selectedRoleSource: null,
              activeFeedbackDraft: null,
              currentFeedbackId: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(interviewConversations.userId, userId),
                inArray(interviewConversations.id, retainedInterviewIds),
              ),
            )
            .returning({ id: interviewConversations.id })
        : [];

    const deletedCompanies =
      liveCompanyIds.length > 0
        ? await tx
            .delete(companies)
            .where(and(eq(companies.userId, userId), inArray(companies.id, liveCompanyIds)))
            .returning({ id: companies.id })
        : [];

    await tx
      .insert(credits)
      .values({
        id: randomUUID(),
        userId,
        balance: CI_E2E_LIVE_SEED_CREDITS,
        monthlyAllocation: CI_E2E_LIVE_SEED_CREDITS,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: credits.userId,
        set: {
          balance: CI_E2E_LIVE_SEED_CREDITS,
          monthlyAllocation: CI_E2E_LIVE_SEED_CREDITS,
          lastResetAt: now,
          updatedAt: now,
        },
      });

    await tx.insert(creditTransactions).values({
      id: randomUUID(),
      userId,
      amount: CI_E2E_LIVE_SEED_CREDITS,
      type: "monthly_grant",
      description: "CI AI live state reset seed",
      balanceAfter: CI_E2E_LIVE_SEED_CREDITS,
      createdAt: now,
    });

    return {
      userId,
      creditBalance: CI_E2E_LIVE_SEED_CREDITS,
      deletedCounts: {
        companies: deletedCompanies.length,
        gakuchikaContents: deletedGakuchikaContents.length,
        motivationConversationsDeleted: deletedMotivationConversations.length,
        motivationConversationsReset: resetMotivationConversations.length,
        interviewConversationsDeleted: deletedInterviewConversations.length,
        interviewConversationsReset: resetInterviewConversations.length,
        interviewFeedbackHistories: deletedInterviewFeedbackHistories.length,
        interviewTurnEvents: 0,
        creditTransactionsDeleted: deletedCreditTransactions.length,
      },
    };
  });
}
