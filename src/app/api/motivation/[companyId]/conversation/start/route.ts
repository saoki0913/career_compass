import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import {
  applications,
  companies,
  jobTypes,
  motivationConversations,
} from "@/lib/db/schema";
import {
  fetchGakuchikaContext,
  fetchProfileContext,
  type GakuchikaContextItem,
  type ProfileContext,
} from "@/lib/ai/user-context";
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

interface MotivationEvaluation {
  scores: MotivationScores;
  weakest_element: string;
  is_complete: boolean;
  missing_aspects?: Record<string, string[]>;
  hidden_eval?: Record<string, number>;
  risk_flags?: string[];
}

interface SuggestionOption {
  id: string;
  label: string;
  sourceType: "company" | "gakuchika" | "profile" | "application_job_type" | "hybrid";
  intent:
    | "company_reason"
    | "desired_work"
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
  userAnchorStrengths: string[];
  userAnchorEpisodes: string[];
  profileAnchorIndustries: string[];
  profileAnchorJobTypes: string[];
  companyAnchorKeywords: string[];
  companyRoleCandidates: string[];
  companyWorkCandidates: string[];
  questionStage:
    | "company_reason"
    | "desired_work"
    | "fit_connection"
    | "differentiation"
    | "closing";
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

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
  evaluation?: MotivationEvaluation;
  target_element?: string;
  company_insight?: string;
  suggestions?: string[];
  suggestion_options?: SuggestionOption[];
  evidence_summary?: string;
  evidence_cards?: EvidenceCard[];
  coaching_focus?: string;
  risk_flags?: string[];
  question_stage?: MotivationConversationContext["questionStage"];
  stage_status?: StageStatus;
  captured_context?: Partial<MotivationConversationContext>;
}

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

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
      questionStage: "company_reason",
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
      userAnchorStrengths: Array.isArray(parsed.userAnchorStrengths) ? parsed.userAnchorStrengths.filter((v: unknown): v is string => typeof v === "string") : [],
      userAnchorEpisodes: Array.isArray(parsed.userAnchorEpisodes) ? parsed.userAnchorEpisodes.filter((v: unknown): v is string => typeof v === "string") : [],
      profileAnchorIndustries: Array.isArray(parsed.profileAnchorIndustries) ? parsed.profileAnchorIndustries.filter((v: unknown): v is string => typeof v === "string") : [],
      profileAnchorJobTypes: Array.isArray(parsed.profileAnchorJobTypes) ? parsed.profileAnchorJobTypes.filter((v: unknown): v is string => typeof v === "string") : [],
      companyAnchorKeywords: Array.isArray(parsed.companyAnchorKeywords) ? parsed.companyAnchorKeywords.filter((v: unknown): v is string => typeof v === "string") : [],
      companyRoleCandidates: Array.isArray(parsed.companyRoleCandidates) ? parsed.companyRoleCandidates.filter((v: unknown): v is string => typeof v === "string") : [],
      companyWorkCandidates: Array.isArray(parsed.companyWorkCandidates) ? parsed.companyWorkCandidates.filter((v: unknown): v is string => typeof v === "string") : [],
      questionStage: typeof parsed.questionStage === "string" ? parsed.questionStage : "company_reason",
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
      questionStage: "company_reason",
    };
  }
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

function buildEvidenceSummaryFromCards(cards: EvidenceCard[]): string | null {
  if (cards.length === 0) return null;
  return cards
    .slice(0, 2)
    .map((card) => `${card.sourceId} ${card.title}: ${card.excerpt}`)
    .join(" / ");
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

function isSetupComplete(
  conversationContext: MotivationConversationContext,
  requiresIndustrySelection: boolean,
): boolean {
  const hasIndustry = !requiresIndustrySelection || Boolean(conversationContext.selectedIndustry);
  return hasIndustry && Boolean(conversationContext.selectedRole);
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

function resolveRoleSelectionSource(
  selectedRole: string,
  profileContext: ProfileContext | null,
  applicationJobCandidates: string[],
  companyRoleCandidates: string[],
  explicitSource?: string | null,
): MotivationConversationContext["selectedRoleSource"] {
  if (explicitSource === "profile" || explicitSource === "company_doc" || explicitSource === "application_job_type" || explicitSource === "user_free_text") {
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

async function getQuestionFromFastAPI(
  company: CompanyData,
  conversationHistory: Message[],
  gakuchikaContext: GakuchikaContextItem[],
  conversationContext: MotivationConversationContext,
  profileContext: ProfileContext | null,
  applicationJobCandidates: string[],
  companyRoleCandidates: string[],
  requiresIndustrySelection: boolean,
  industryOptions: string[],
): Promise<{
  question: string | null;
  error: string | null;
  evaluation: MotivationEvaluation | null;
  suggestions: string[];
  suggestionOptions: SuggestionOption[];
  evidenceSummary: string | null;
  evidenceCards: EvidenceCard[];
  coachingFocus: string | null;
  riskFlags: string[];
  questionStage: MotivationConversationContext["questionStage"] | null;
  stageStatus: StageStatus | null;
  capturedContext: Partial<MotivationConversationContext> | null;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${FASTAPI_URL}/api/motivation/next-question`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        conversation_history: conversationHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        question_count: 0,
        scores: null,
        gakuchika_context: gakuchikaContext.length > 0 ? gakuchikaContext : null,
        conversation_context: conversationContext,
        profile_context: profileContext,
        application_job_candidates: applicationJobCandidates.length > 0 ? applicationJobCandidates : null,
        company_role_candidates: companyRoleCandidates.length > 0 ? companyRoleCandidates : null,
        company_work_candidates: conversationContext.companyWorkCandidates.length > 0 ? conversationContext.companyWorkCandidates : null,
        requires_industry_selection: requiresIndustrySelection,
        industry_options: industryOptions.length > 0 ? industryOptions : null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        question: null,
        error: errorData.detail?.error || "AIサービスに接続できませんでした",
        evaluation: null,
        suggestions: [],
        suggestionOptions: [],
        evidenceSummary: null,
        evidenceCards: [],
        coachingFocus: null,
        riskFlags: [],
        questionStage: null,
        stageStatus: null,
        capturedContext: null,
      };
    }

    const data: FastAPIQuestionResponse = await response.json();
    return {
      question: data.question,
      error: null,
      evaluation: data.evaluation || null,
      suggestions: data.suggestions || [],
      suggestionOptions: data.suggestion_options || [],
      evidenceSummary: data.evidence_summary || null,
      evidenceCards: data.evidence_cards || [],
      coachingFocus: data.coaching_focus || null,
      riskFlags: Array.isArray(data.risk_flags) ? data.risk_flags : [],
      questionStage: data.question_stage || null,
      stageStatus: data.stage_status || null,
      capturedContext: data.captured_context || null,
    };
  } catch (error) {
    console.error("[MotivationStart] FastAPI error:", error);
    return {
      question: null,
      error: error instanceof Error && error.name === "AbortError"
        ? "AIの応答がタイムアウトしました"
        : "AIサービスに接続できませんでした",
      evaluation: null,
      suggestions: [],
      suggestionOptions: [],
      evidenceSummary: null,
      evidenceCards: [],
      coachingFocus: null,
      riskFlags: [],
      questionStage: null,
      stageStatus: null,
      capturedContext: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { companyId } = await params;
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { userId, guestId } = identity;
    const body = await request.json().catch(() => null);
    const selectedIndustry = typeof body?.selectedIndustry === "string" ? body.selectedIndustry.trim() : "";
    const selectedRole = typeof body?.selectedRole === "string" ? body.selectedRole.trim() : "";
    const roleSelectionSource = typeof body?.roleSelectionSource === "string" ? body.roleSelectionSource.trim() : null;

    if (!selectedRole) {
      return NextResponse.json({ error: "志望職種を選択してください" }, { status: 400 });
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    const ownerCondition = userId
      ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
      : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!));

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

    if (!conversation) {
      return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
    }

    if (conversation.status === "completed") {
      return NextResponse.json({ error: "この会話は既に完了しています" }, { status: 400 });
    }

    if (conversation.messages !== "[]") {
      return NextResponse.json({ error: "この会話は既に開始されています" }, { status: 409 });
    }

    const profileContext = await fetchProfileContext(userId);
    const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];
    const applicationJobCandidates = await fetchApplicationJobCandidates(companyId, userId, guestId);
    const existingContext = safeParseConversationContext(conversation.conversationContext);
    const setupContext: MotivationConversationContext = {
      ...existingContext,
      selectedIndustry: selectedIndustry || existingContext.selectedIndustry,
      selectedIndustrySource:
        selectedIndustry
          ? "user_selected"
          : existingContext.selectedIndustrySource,
      selectedRole,
      selectedRoleSource: existingContext.selectedRoleSource,
      questionStage: "company_reason",
    };

    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      setupContext,
      applicationJobCandidates,
    );
    resolvedInputs.conversationContext.selectedRoleSource = resolveRoleSelectionSource(
      selectedRole,
      profileContext,
      applicationJobCandidates,
      resolvedInputs.companyRoleCandidates,
      roleSelectionSource,
    );

    if (!isSetupComplete(resolvedInputs.conversationContext, resolvedInputs.requiresIndustrySelection)) {
      return NextResponse.json({ error: "先に業界・職種の設定を完了してください" }, { status: 400 });
    }

    const result = await getQuestionFromFastAPI(
      resolvedInputs.company,
      [],
      gakuchikaContext,
      resolvedInputs.conversationContext,
      profileContext,
      applicationJobCandidates,
      resolvedInputs.companyRoleCandidates,
      resolvedInputs.requiresIndustrySelection,
      resolvedInputs.industryOptions,
    );

    if (result.error || !result.question) {
      return NextResponse.json({ error: result.error || "初回質問の生成に失敗しました" }, { status: 503 });
    }

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result.question,
    };

    const messages = [assistantMessage];
    const persistedContext = {
      ...resolvedInputs.conversationContext,
      ...(result.capturedContext || {}),
    };

    await db
      .update(motivationConversations)
      .set(await filterMotivationConversationUpdate({
        messages: JSON.stringify(messages),
        questionCount: 0,
        status: "in_progress",
        motivationScores: result.evaluation ? JSON.stringify(result.evaluation.scores) : null,
        conversationContext: JSON.stringify(persistedContext),
        selectedRole: persistedContext.selectedRole ?? null,
        selectedRoleSource: persistedContext.selectedRoleSource ?? null,
        desiredWork: persistedContext.desiredWork ?? null,
        questionStage: result.questionStage ?? persistedContext.questionStage,
        lastSuggestions: JSON.stringify(result.suggestions || []),
        lastSuggestionOptions: JSON.stringify(result.suggestionOptions || []),
        lastEvidenceCards: JSON.stringify(result.evidenceCards || []),
        stageStatus: JSON.stringify(result.stageStatus || null),
        updatedAt: new Date(),
      }))
      .where(eq(motivationConversations.id, conversation.id));

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount: 0,
        status: "in_progress",
      },
      messages,
      nextQuestion: result.question,
      suggestions: result.suggestions,
      suggestionOptions: result.suggestionOptions,
      questionCount: 0,
      isCompleted: false,
      scores: result.evaluation?.scores || null,
      evidenceSummary: result.evidenceSummary || buildEvidenceSummaryFromCards(result.evidenceCards),
      evidenceCards: result.evidenceCards,
      coachingFocus: result.coachingFocus,
      riskFlags: result.riskFlags,
      questionStage: result.questionStage || persistedContext.questionStage,
      stageStatus: result.stageStatus,
      conversationContext: persistedContext,
      setup: {
        selectedIndustry: persistedContext.selectedIndustry || resolvedInputs.company.industry,
        selectedRole: persistedContext.selectedRole || null,
        selectedRoleSource: persistedContext.selectedRoleSource || null,
        requiresIndustrySelection: resolvedInputs.requiresIndustrySelection,
        resolvedIndustry: resolvedInputs.company.industry,
        isComplete: true,
        requiresRestart: false,
        hasSavedConversation: true,
      },
    });
  } catch (error) {
    console.error("[MotivationStart] Failed to start conversation:", error);
    return NextResponse.json({ error: "会話開始中にエラーが発生しました" }, { status: 500 });
  }
}
