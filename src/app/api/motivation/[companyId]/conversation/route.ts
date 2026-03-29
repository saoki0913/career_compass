/**
 * Motivation Conversation API
 *
 * GET: Get conversation history
 * DELETE: Reset conversation
 *
 * 回答送信は `conversation/stream`（SSE）のみ。
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  motivationConversations,
  companies,
  applications,
  jobTypes,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { logError } from "@/lib/logger";
import {
  getMotivationConversationByCondition as getConversationByCondition,
  safeParseConversationContext as parseConversationContext,
  safeParseEvidenceCards as parseEvidenceCards,
  safeParseMessages as parseMessages,
  safeParseScores as parseScores,
  safeParseStageStatus as parseStageStatus,
  safeParseSuggestionOptions as parseSuggestionOptions,
  resolveDraftReadyState,
} from "@/lib/motivation/conversation";
import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    return { userId: session.user.id, guestId: null };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return { userId: null, guestId: guest.id };
    }
  }

  return null;
}

interface SuggestionOption {
  id: string;
  label: string;
  sourceType: "company" | "gakuchika" | "profile" | "application_job_type" | "hybrid";
  intent:
    | "industry_reason"
    | "company_reason"
    | "desired_work"
    | "origin_experience"
    | "fit_connection"
    | "differentiation"
    | "closing";
  evidenceSourceIds?: string[];
  rationale?: string | null;
  isTentative?: boolean;
}

interface EvidenceCard {
  sourceId: string;
  title: string;
  contentType: string;
  excerpt: string;
  sourceUrl: string;
  relevanceLabel: string;
}

interface StageStatus {
  current: MotivationConversationContext["questionStage"];
  completed: MotivationConversationContext["questionStage"][];
  pending: MotivationConversationContext["questionStage"][];
}

interface MotivationConversationContext {
  selectedIndustry?: string;
  selectedIndustrySource?: "company_field" | "company_override" | "user_selected";
  industryReason?: string;
  companyReason?: string;
  selectedRole?: string;
  selectedRoleSource?: "profile" | "company_doc" | "application_job_type" | "user_free_text";
  desiredWork?: string;
  originExperience?: string;
  userAnchorStrengths: string[];
  userAnchorEpisodes: string[];
  profileAnchorIndustries: string[];
  profileAnchorJobTypes: string[];
  companyAnchorKeywords: string[];
  companyRoleCandidates: string[];
  companyWorkCandidates: string[];
  stageAttemptCount?: number;
  lastQuestionSignature?: string | null;
  confirmedFacts?: Record<string, boolean>;
  openSlots?: string[];
  lastQuestionMeta?: {
    questionText?: string | null;
    question_signature?: string | null;
    question_stage?: string | null;
    stage_attempt_count?: number | null;
    premise_mode?: string | null;
  } | null;
  questionStage:
    | "industry_reason"
    | "company_reason"
    | "desired_work"
    | "origin_experience"
    | "fit_connection"
    | "differentiation"
    | "closing";
}

function buildEvidenceSummaryFromCards(cards: EvidenceCard[]): string | null {
  if (cards.length === 0) return null;
  return cards
    .slice(0, 2)
    .map((card) => `${card.sourceId} ${card.title}: ${card.excerpt}`)
    .join(" / ");
}

interface CompanyData {
  id: string;
  name: string;
  industry: string | null;
}

interface ResolvedMotivationInputs {
  company: CompanyData;
  conversationContext: MotivationConversationContext;
  requiresIndustrySelection: boolean;
  industryOptions: string[];
  companyRoleCandidates: string[];
}

function isSetupComplete(
  conversationContext: MotivationConversationContext,
  requiresIndustrySelection: boolean,
): boolean {
  const hasIndustry = !requiresIndustrySelection || Boolean(conversationContext.selectedIndustry);
  return hasIndustry && Boolean(conversationContext.selectedRole);
}

function uniqueStrings(values: Array<string | null | undefined>, maxItems = 8): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
}

function resolveMotivationInputs(
  company: CompanyData,
  conversationContext: MotivationConversationContext,
  applicationJobCandidates: string[],
): ResolvedMotivationInputs {
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
      ...conversationContext.companyRoleCandidates,
      ...resolution.roleCandidates,
    ]),
  };

  return {
    company: {
      ...company,
      industry: resolution.resolvedIndustry,
    },
    conversationContext: nextContext,
    requiresIndustrySelection: resolution.requiresIndustrySelection,
    industryOptions: [...resolution.industryOptions],
    companyRoleCandidates: resolution.roleCandidates,
  };
}

async function fetchApplicationJobCandidates(
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
        : and(eq(applications.companyId, companyId), eq(applications.guestId, guestId!))
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

// GET: Fetch conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    if (!identity.userId) {
      return NextResponse.json(
        { error: "志望動機のAI支援はログインが必要です" },
        { status: 401 },
      );
    }

    const { userId, guestId } = identity;
    const ownerCondition = userId
      ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
      : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!));

    // Get company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    // Find or create conversation
    let conversation = await getConversationByCondition(ownerCondition);

    if (!conversation) {
      const newId = crypto.randomUUID();
      const now = new Date();
      const baseConversation = {
        id: newId,
        userId,
        guestId,
        companyId,
        messages: "[]",
        questionCount: 0,
        status: "in_progress" as const,
        createdAt: now,
        updatedAt: now,
      };

      if (userId) {
        await db
          .insert(motivationConversations)
          .values(baseConversation)
          .onConflictDoNothing({
            target: [motivationConversations.companyId, motivationConversations.userId],
          });
      } else {
        await db
          .insert(motivationConversations)
          .values(baseConversation)
          .onConflictDoNothing({
            target: [motivationConversations.companyId, motivationConversations.guestId],
          });
      }

      conversation = await getConversationByCondition(ownerCondition);
    }

    if (!conversation) {
      return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
    }

    const messages = parseMessages(conversation.messages);
    const scores = parseScores(conversation.motivationScores);
    const initialConversationContext = parseConversationContext(conversation.conversationContext);
    const { isDraftReady } = resolveDraftReadyState(
      initialConversationContext,
      conversation.status as "in_progress" | "completed" | null,
    );
    const suggestionOptionsFromDb = parseSuggestionOptions(conversation.lastSuggestionOptions);
    const evidenceCardsFromDb = parseEvidenceCards(conversation.lastEvidenceCards);
    let applicationJobCandidates: string[] = [];
    try {
      applicationJobCandidates = await fetchApplicationJobCandidates(companyId, userId, guestId);
    } catch (error) {
      logError("get-motivation-conversation:application-job-candidates", error, {
        companyId,
        userId: userId ?? undefined,
        guestId: guestId ?? undefined,
      });
    }
    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      initialConversationContext,
      applicationJobCandidates,
    );
    const conversationContext = resolvedInputs.conversationContext;
    const setupComplete = isSetupComplete(
      conversationContext,
      resolvedInputs.requiresIndustrySelection,
    );
    const stageStatusFromDb = parseStageStatus(
      conversation.stageStatus,
      {
        ...conversationContext,
        questionStage: (conversation.questionStage as MotivationConversationContext["questionStage"] | null) || conversationContext.questionStage,
      },
    );

    // Get next question if not completed
    let nextQuestion: string | null = null;
    let suggestionOptions: SuggestionOption[] = [];
    let evidenceSummary: string | null = buildEvidenceSummaryFromCards(evidenceCardsFromDb);
    let evidenceCards: EvidenceCard[] = evidenceCardsFromDb;
    const coachingFocus: string | null = null;
    const riskFlags: string[] = [];
    const stageStatus: StageStatus | null = stageStatusFromDb;
    const initError: string | null = null;

    if (messages.length > 0) {
      nextQuestion =
        conversationContext.lastQuestionMeta?.questionText ||
        ((messages[messages.length - 1]?.role === "assistant"
          ? messages[messages.length - 1]?.content
          : null) ?? null);
      suggestionOptions = suggestionOptionsFromDb;
      evidenceCards = evidenceCardsFromDb;
      evidenceSummary = buildEvidenceSummaryFromCards(evidenceCardsFromDb);
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount: conversation.questionCount,
        status: conversation.status,
      },
      messages,
      nextQuestion,
      suggestionOptions,
      questionCount: conversation.questionCount ?? 0,
      isDraftReady,
      scores,
      evidenceSummary,
      evidenceCards,
      coachingFocus,
      riskFlags,
      generatedDraft: conversation.generatedDraft,
      conversationContext,
      setup: {
        selectedIndustry: conversationContext.selectedIndustry || resolvedInputs.company.industry,
        selectedRole: conversationContext.selectedRole || null,
        selectedRoleSource: conversationContext.selectedRoleSource || null,
        requiresIndustrySelection: resolvedInputs.requiresIndustrySelection,
        resolvedIndustry: resolvedInputs.company.industry,
        isComplete: setupComplete,
        requiresRestart: false,
        hasSavedConversation: (conversation.questionCount ?? 0) > 0 || messages.length > 0 || isDraftReady,
      },
      questionStage: conversation.questionStage || conversationContext.questionStage,
      stageStatus,
      error: initError,
    });
  } catch (error) {
    logError("get-motivation-conversation", error);
    return NextResponse.json(
      { error: "会話データの取得中にエラーが発生しました" },
      { status: 500 }
    );
  }
}

// DELETE: Reset conversation history
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  const conversation = await getConversationByCondition(
    userId
      ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
      : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
  );

  if (!conversation) {
    return NextResponse.json({ success: true, reset: false });
  }

  await db
    .update(motivationConversations)
    .set({
      messages: "[]",
      questionCount: 0,
      status: "in_progress" as const,
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
      updatedAt: new Date(),
    })
    .where(eq(motivationConversations.id, conversation.id));

  return NextResponse.json({ success: true, reset: true });
}
