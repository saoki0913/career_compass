import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import {
  fetchGakuchikaContext,
  fetchProfileContext,
  type GakuchikaContextItem,
  type ProfileContext,
} from "@/lib/ai/user-context";
import {
  mergeDraftReadyContext,
  resolveDraftReadyState,
  safeParseConversationContext as parseConversationContext,
  safeParseMessages,
  serializeConversationContext,
  serializeEvidenceCards,
  serializeMessages,
  serializeScores,
  serializeStageStatus,
  type CausalGap,
  type MotivationProgress,
  type StageStatus,
  type MotivationConversationContext as BaseMotivationConversationContext,
} from "@/lib/motivation/conversation";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import {
  ensureMotivationConversation,
  fetchMotivationApplicationJobCandidates,
  getOwnedMotivationCompanyData,
  isMotivationSetupComplete,
  resolveMotivationInputs,
  resolveMotivationRoleSelectionSource,
  type MotivationCompanyData as CompanyData,
  type MotivationEvidenceCard as EvidenceCard,
} from "@/lib/motivation/motivation-input-resolver";
import { buildMotivationConversationPayload } from "@/lib/motivation/conversation-payload";

function resolveSafeMotivationStartError(raw: string | null | undefined): {
  userMessage: string;
  action: string;
  status: number;
  code: string;
} {
  if (raw?.includes("内部設定や秘匿情報に関する指示")) {
    return {
      userMessage: raw,
      action: "入力内容を見直して、もう一度お試しください。",
      status: 400,
      code: "MOTIVATION_UNSAFE_INPUT",
    };
  }
  return {
    userMessage: "初回質問を生成できませんでした。",
    action: "時間を置いて、もう一度お試しください。",
    status: 503,
    code: "MOTIVATION_START_FAILED",
  };
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
  ready_for_draft?: boolean;
  slot_status?: Record<string, string>;
  slot_status_v2?: Record<string, "filled_strong" | "filled_weak" | "partial" | "missing">;
  missing_slots?: string[];
  weak_slots?: string[];
  do_not_ask_slots?: string[];
  draft_readiness_reason?: string;
  draft_blockers?: string[];
  missing_aspects?: Record<string, string[]>;
  hidden_eval?: Record<string, number>;
  risk_flags?: string[];
}

type MotivationConversationContext = BaseMotivationConversationContext;

interface FastAPIQuestionResponse {
  question: string;
  reasoning?: string;
  should_continue?: boolean;
  suggested_end?: boolean;
  draft_ready?: boolean;
  evaluation?: MotivationEvaluation;
  target_slot?: MotivationConversationContext["questionStage"];
  question_intent?: string;
  answer_contract?: Record<string, unknown>;
  target_element?: string;
  company_insight?: string;
  evidence_summary?: string;
  evidence_cards?: EvidenceCard[];
  coaching_focus?: string;
  risk_flags?: string[];
  question_stage?: MotivationConversationContext["questionStage"];
  question_focus?: string;
  semantic_question_signature?: string;
  question_difficulty_level?: number;
  candidate_validation_summary?: Record<string, unknown>;
  weakness_tag?: string;
  conversation_mode?: "slot_fill" | "deepdive";
  current_slot?: MotivationConversationContext["questionStage"] | null;
  current_intent?: string | null;
  next_advance_condition?: string | null;
  progress?: MotivationProgress | null;
  causal_gaps?: CausalGap[];
  stage_status?: StageStatus;
  captured_context?: Partial<MotivationConversationContext>;
  internal_telemetry?: unknown;
}

async function getQuestionFromFastAPI(
  company: CompanyData,
  requestId: string,
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
  draftReady: boolean;
  evidenceSummary: string | null;
  evidenceCards: EvidenceCard[];
  coachingFocus: string | null;
  riskFlags: string[];
  questionStage: MotivationConversationContext["questionStage"] | null;
  stageStatus: StageStatus | null;
  conversationMode: "slot_fill" | "deepdive" | null;
  currentSlot: MotivationConversationContext["questionStage"] | null;
  currentIntent: string | null;
  nextAdvanceCondition: string | null;
  progress: MotivationProgress | null;
  causalGaps: CausalGap[];
  capturedContext: Partial<MotivationConversationContext> | null;
  telemetry: InternalCostTelemetry | null;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetchFastApiInternal("/api/motivation/next-question", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
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
        draftReady: false,
        evidenceSummary: null,
        evidenceCards: [],
        coachingFocus: null,
        riskFlags: [],
        questionStage: null,
        stageStatus: null,
        conversationMode: null,
        currentSlot: null,
        currentIntent: null,
        nextAdvanceCondition: null,
        progress: null,
        causalGaps: [],
        capturedContext: null,
        telemetry: null,
      };
    }

    const rawData = await response.json();
    const { payload, telemetry } = splitInternalTelemetry(rawData);
    const data = payload as FastAPIQuestionResponse;
    return {
      question: data.question,
      error: null,
      evaluation: data.evaluation || null,
      draftReady: Boolean(data.draft_ready),
      evidenceSummary: data.evidence_summary || null,
      evidenceCards: data.evidence_cards || [],
      coachingFocus: data.coaching_focus || null,
      riskFlags: Array.isArray(data.risk_flags) ? data.risk_flags : [],
      questionStage: data.question_stage || null,
      stageStatus: data.stage_status || null,
      conversationMode: data.conversation_mode || null,
      currentSlot: data.current_slot || null,
      currentIntent: data.current_intent || null,
      nextAdvanceCondition: data.next_advance_condition || null,
      progress: data.progress || null,
      causalGaps: Array.isArray(data.causal_gaps) ? data.causal_gaps : [],
      capturedContext: data.captured_context || null,
      telemetry,
    };
  } catch (error) {
    console.error("[MotivationStart] FastAPI error:", error);
    return {
      question: null,
      error: error instanceof Error && error.name === "AbortError"
        ? "AIの応答がタイムアウトしました"
        : "AIサービスに接続できませんでした",
      evaluation: null,
      draftReady: false,
      evidenceSummary: null,
      evidenceCards: [],
      coachingFocus: null,
      riskFlags: [],
      questionStage: null,
      stageStatus: null,
      conversationMode: null,
      currentSlot: null,
      currentIntent: null,
      nextAdvanceCondition: null,
      progress: null,
      causalGaps: [],
      capturedContext: null,
      telemetry: null,
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
    const requestId = getRequestId(request);
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { userId, guestId } = identity;

    if (!userId) {
      return NextResponse.json(
        { error: "志望動機のAI支援はログインが必要です" },
        { status: 401 },
      );
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CONVERSATION_RATE_LAYERS],
      userId,
      guestId,
      "motivation_conversation_start"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => null);
    const selectedIndustry = typeof body?.selectedIndustry === "string" ? body.selectedIndustry.trim() : "";
    const selectedRole = typeof body?.selectedRole === "string" ? body.selectedRole.trim() : "";
    const roleSelectionSource = typeof body?.roleSelectionSource === "string" ? body.roleSelectionSource.trim() : null;

    if (!selectedRole) {
      return NextResponse.json({ error: "志望職種を選択してください" }, { status: 400 });
    }

    const company = await getOwnedMotivationCompanyData(companyId, identity);

    if (!company) {
      return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
    }

    const conversation = await ensureMotivationConversation(companyId, userId, guestId);

    if (!conversation) {
      return NextResponse.json({ error: "会話の作成に失敗しました" }, { status: 500 });
    }

    if (safeParseMessages(conversation.messages).length > 0) {
      return NextResponse.json({ error: "この会話は既に開始されています" }, { status: 409 });
    }

    const profileContext = await fetchProfileContext(userId);
    const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];
    const applicationJobCandidates = await fetchMotivationApplicationJobCandidates(companyId, userId, guestId);
    const existingContext = parseConversationContext(conversation.conversationContext);
    const setupContext: MotivationConversationContext = {
      ...existingContext,
      selectedIndustry: selectedIndustry || existingContext.selectedIndustry,
      selectedIndustrySource:
        selectedIndustry
          ? "user_selected"
          : existingContext.selectedIndustrySource,
      selectedRole,
      selectedRoleSource: existingContext.selectedRoleSource,
      questionStage: "industry_reason",
    };

    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      setupContext,
      applicationJobCandidates,
    );
    resolvedInputs.conversationContext.selectedRoleSource = resolveMotivationRoleSelectionSource(
      selectedRole,
      profileContext,
      applicationJobCandidates,
      resolvedInputs.companyRoleCandidates,
      roleSelectionSource,
    );

    if (!isMotivationSetupComplete(resolvedInputs.conversationContext, resolvedInputs.requiresIndustrySelection)) {
      return NextResponse.json({ error: "先に業界・職種の設定を完了してください" }, { status: 400 });
    }

    const result = await getQuestionFromFastAPI(
      resolvedInputs.company,
      requestId,
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
      logAiCreditCostSummary({
        feature: "motivation_start",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: result.telemetry,
      });
      const safe = resolveSafeMotivationStartError(result.error);
      return createApiErrorResponse(request, {
        status: safe.status,
        code: safe.code,
        userMessage: safe.userMessage,
        action: safe.action,
        retryable: safe.status >= 500,
        developerMessage: result.error || "初回質問の生成に失敗しました",
      });
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
      lastQuestionMeta: {
        ...resolvedInputs.conversationContext.lastQuestionMeta,
        ...((result.capturedContext?.lastQuestionMeta as Record<string, unknown> | undefined) || {}),
        questionText: result.question,
      },
    };
    const currentDraftReadyState = resolveDraftReadyState(
      persistedContext,
      conversation.status as "in_progress" | "completed" | null,
    );
    const isDraftReady = currentDraftReadyState.isDraftReady || result.draftReady;
    const nextContext = mergeDraftReadyContext(
      persistedContext,
      isDraftReady,
      currentDraftReadyState.unlockedAt ?? undefined,
    );

    const updatedRows = await db
      .update(motivationConversations)
      .set({
        messages: serializeMessages(messages),
        questionCount: 0,
        status: isDraftReady ? "completed" : "in_progress",
        motivationScores: serializeScores(result.evaluation?.scores ?? null),
        conversationContext: serializeConversationContext(nextContext),
        selectedRole: nextContext.selectedRole ?? null,
        selectedRoleSource: nextContext.selectedRoleSource ?? null,
        desiredWork: nextContext.desiredWork ?? null,
        questionStage: result.questionStage ?? nextContext.questionStage,
        lastEvidenceCards: serializeEvidenceCards(result.evidenceCards || []),
        stageStatus: serializeStageStatus(result.stageStatus || null),
        updatedAt: new Date(),
      })
      .where(and(eq(motivationConversations.id, conversation.id), eq(motivationConversations.updatedAt, conversation.updatedAt)))
      .returning({ id: motivationConversations.id });

    if (updatedRows.length === 0) {
      return NextResponse.json(
        { error: "別のタブまたは直前の操作で会話が更新されました。画面を再読み込みしてからやり直してください。" },
        { status: 409 },
      );
    }
    logAiCreditCostSummary({
      feature: "motivation_start",
      requestId,
      status: "success",
      creditsUsed: 0,
      telemetry: result.telemetry,
    });

    const payload = buildMotivationConversationPayload({
      messages,
      nextQuestion: result.question,
      questionCount: 0,
      isDraftReady,
      scores: result.evaluation?.scores || null,
      conversationContext: nextContext,
      persistedQuestionStage: result.questionStage ?? nextContext.questionStage,
      stageStatusValue: result.stageStatus,
      evidenceSummary: result.evidenceSummary || null,
      evidenceCards: result.evidenceCards,
      coachingFocus: result.coachingFocus,
      riskFlags: result.riskFlags,
      conversationMode: result.conversationMode ?? nextContext.conversationMode ?? "slot_fill",
      currentIntent: result.currentIntent,
      nextAdvanceCondition: result.nextAdvanceCondition,
      progress: result.progress,
      causalGaps: result.causalGaps,
      resolvedIndustry: resolvedInputs.company.industry,
      requiresIndustrySelection: resolvedInputs.requiresIndustrySelection,
      isSetupComplete: true,
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount: 0,
        status: isDraftReady ? "completed" : "in_progress",
      },
      ...payload,
    });
  } catch (error) {
    console.error("[MotivationStart] Failed to start conversation:", error);
    return NextResponse.json({ error: "会話開始中にエラーが発生しました" }, { status: 500 });
  }
}
