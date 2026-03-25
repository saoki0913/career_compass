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
  filterMotivationConversationUpdate,
  getMotivationConversationByCondition,
} from "@/lib/db/motivationConversationCompat";
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
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
  questionStage:
    | "industry_reason"
    | "company_reason"
    | "desired_work"
    | "origin_experience"
    | "fit_connection"
    | "differentiation"
    | "closing";
}

function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { role: string; content: string; id?: string } =>
        m && typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
      )
      .map(m => ({
        id: m.id || crypto.randomUUID(),
        role: m.role as "user" | "assistant",
        content: m.content
      }));
  } catch {
    return [];
  }
}

function safeParseSuggestionOptions(json: string | null): SuggestionOption[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SuggestionOption =>
      item &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.label === "string" &&
      typeof item.sourceType === "string" &&
      typeof item.intent === "string"
    );
  } catch {
    return [];
  }
}

function safeParseEvidenceCards(json: string | null): EvidenceCard[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is EvidenceCard =>
      item &&
      typeof item === "object" &&
      typeof item.sourceId === "string" &&
      typeof item.title === "string" &&
      typeof item.contentType === "string" &&
      typeof item.excerpt === "string" &&
      typeof item.sourceUrl === "string" &&
      typeof item.relevanceLabel === "string"
    );
  } catch {
    return [];
  }
}

const STAGE_ORDER: MotivationConversationContext["questionStage"][] = [
  "industry_reason",
  "company_reason",
  "desired_work",
  "origin_experience",
  "fit_connection",
  "differentiation",
  "closing",
];

function safeParseStageStatus(
  json: string | null,
  conversationContext?: MotivationConversationContext | null,
): StageStatus {
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object" && typeof parsed.current === "string") {
        return {
          current: parsed.current,
          completed: Array.isArray(parsed.completed) ? parsed.completed : [],
          pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        } as StageStatus;
      }
    } catch {
      // Fall through to derived value
    }
  }

  const context = conversationContext || safeParseConversationContext(null);
  const current =
    context.questionStage ||
    (context.originExperience
      ? "fit_connection"
      : context.desiredWork
      ? "origin_experience"
      : context.companyReason
        ? "desired_work"
        : context.industryReason
          ? "company_reason"
          : "industry_reason");
  const completed: StageStatus["completed"] = [];
  if (context.industryReason) completed.push("industry_reason");
  if (context.companyReason) completed.push("company_reason");
  if (context.desiredWork) completed.push("desired_work");
  if (context.originExperience) completed.push("origin_experience");
  const pending = STAGE_ORDER.filter((stage) => stage !== current && !completed.includes(stage));
  return { current, completed, pending };
}

function buildEvidenceSummaryFromCards(cards: EvidenceCard[]): string | null {
  if (cards.length === 0) return null;
  return cards
    .slice(0, 2)
    .map((card) => `${card.sourceId} ${card.title}: ${card.excerpt}`)
    .join(" / ");
}

function safeParseConversationContext(json: string | null): MotivationConversationContext {
  if (!json) {
    return {
      userAnchorStrengths: [],
      userAnchorEpisodes: [],
      profileAnchorIndustries: [],
      profileAnchorJobTypes: [],
      companyAnchorKeywords: [],
      companyRoleCandidates: [],
      companyWorkCandidates: [],
      questionStage: "industry_reason",
    };
  }

  try {
    const parsed = JSON.parse(json);
    return {
      selectedIndustry: typeof parsed.selectedIndustry === "string" ? parsed.selectedIndustry : undefined,
      selectedIndustrySource: typeof parsed.selectedIndustrySource === "string" ? parsed.selectedIndustrySource : undefined,
      industryReason: typeof parsed.industryReason === "string" ? parsed.industryReason : undefined,
      companyReason: typeof parsed.companyReason === "string" ? parsed.companyReason : undefined,
      selectedRole: typeof parsed.selectedRole === "string" ? parsed.selectedRole : undefined,
      selectedRoleSource: typeof parsed.selectedRoleSource === "string" ? parsed.selectedRoleSource : undefined,
      desiredWork: typeof parsed.desiredWork === "string" ? parsed.desiredWork : undefined,
      originExperience: typeof parsed.originExperience === "string" ? parsed.originExperience : undefined,
      userAnchorStrengths: Array.isArray(parsed.userAnchorStrengths) ? parsed.userAnchorStrengths.filter((v: unknown): v is string => typeof v === "string") : [],
      userAnchorEpisodes: Array.isArray(parsed.userAnchorEpisodes) ? parsed.userAnchorEpisodes.filter((v: unknown): v is string => typeof v === "string") : [],
      profileAnchorIndustries: Array.isArray(parsed.profileAnchorIndustries) ? parsed.profileAnchorIndustries.filter((v: unknown): v is string => typeof v === "string") : [],
      profileAnchorJobTypes: Array.isArray(parsed.profileAnchorJobTypes) ? parsed.profileAnchorJobTypes.filter((v: unknown): v is string => typeof v === "string") : [],
      companyAnchorKeywords: Array.isArray(parsed.companyAnchorKeywords) ? parsed.companyAnchorKeywords.filter((v: unknown): v is string => typeof v === "string") : [],
      companyRoleCandidates: Array.isArray(parsed.companyRoleCandidates) ? parsed.companyRoleCandidates.filter((v: unknown): v is string => typeof v === "string") : [],
      companyWorkCandidates: Array.isArray(parsed.companyWorkCandidates) ? parsed.companyWorkCandidates.filter((v: unknown): v is string => typeof v === "string") : [],
      questionStage: typeof parsed.questionStage === "string" ? parsed.questionStage : "industry_reason",
    };
  } catch {
    return {
      userAnchorStrengths: [],
      userAnchorEpisodes: [],
      profileAnchorIndustries: [],
      profileAnchorJobTypes: [],
      companyAnchorKeywords: [],
      companyRoleCandidates: [],
      companyWorkCandidates: [],
      questionStage: "industry_reason",
    };
  }
}

function safeParseScores(json: string | null): MotivationScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      company_understanding: parsed.company_understanding ?? 0,
      self_analysis: parsed.self_analysis ?? 0,
      career_vision: parsed.career_vision ?? 0,
      differentiation: parsed.differentiation ?? 0,
    };
  } catch {
    return null;
  }
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
    let conversation = await getMotivationConversationByCondition(ownerCondition);

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

      conversation = await getMotivationConversationByCondition(ownerCondition);
    }

    if (!conversation) {
      return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
    }

    const messages = safeParseMessages(conversation.messages);
    const scores = safeParseScores(conversation.motivationScores);
    const isCompleted = conversation.status === "completed";
    const initialConversationContext = safeParseConversationContext(conversation.conversationContext);
    const suggestionOptionsFromDb = safeParseSuggestionOptions(conversation.lastSuggestionOptions);
    const evidenceCardsFromDb = safeParseEvidenceCards(conversation.lastEvidenceCards);
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
    const requiresRestartForSetup = messages.length > 0 && !setupComplete;
    const stageStatusFromDb = safeParseStageStatus(
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
    let coachingFocus: string | null = null;
    let riskFlags: string[] = [];
    let stageStatus: StageStatus | null = stageStatusFromDb;
    const initError: string | null = null;

    if (!isCompleted) {
      if (messages.length > 0) {
        // Existing conversation: extract nextQuestion from last assistant message
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
          nextQuestion = lastMessage.content;
        }
        suggestionOptions = suggestionOptionsFromDb;
        evidenceCards = evidenceCardsFromDb;
        evidenceSummary = buildEvidenceSummaryFromCards(evidenceCardsFromDb);
      }
    }

    if (requiresRestartForSetup) {
      nextQuestion = null;
      suggestionOptions = [];
      evidenceSummary = null;
      evidenceCards = [];
      coachingFocus = null;
      riskFlags = [];
      stageStatus = null;
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
      isCompleted,
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
        requiresRestart: requiresRestartForSetup,
        hasSavedConversation: (conversation.questionCount ?? 0) > 0 || messages.length > 0 || isCompleted,
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

  const conversation = await getMotivationConversationByCondition(
    userId
      ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
      : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
  );

  if (!conversation) {
    return NextResponse.json({ success: true, reset: false });
  }

  await db
    .update(motivationConversations)
    .set(await filterMotivationConversationUpdate({
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
    }))
    .where(eq(motivationConversations.id, conversation.id));

  return NextResponse.json({ success: true, reset: true });
}
