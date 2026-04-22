/**
 * Motivation Conversation SSE Stream API
 *
 * POST: Send answer and get next question via SSE streaming.
 * Proxies FastAPI SSE with "consume-and-re-emit" pattern:
 *   - progress events → forwarded immediately
 *   - complete event → DB save + credit consumption, then forwarded
 *   - error event → forwarded (no credit consumed)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  fetchGakuchikaContext,
  fetchProfileContext,
} from "@/lib/ai/user-context";
import {
  motivationStreamPolicy,
} from "@/lib/api-route/billing/motivation-stream-policy";
import { CONVERSATION_CREDITS_PER_TURN } from "@/lib/credits";
import { createSSEProxyStream } from "@/lib/fastapi/sse-proxy";
import {
  type CausalGap as BaseCausalGap,
  type EvidenceCard,
  mergeDraftReadyContext,
  type Message,
  type MotivationProgress as BaseMotivationProgress,
  resolveDraftReadyState,
  safeParseConversationContext as parseConversationContext,
  safeParseMessages,
  safeParseScores,
  serializeConversationContext,
  serializeEvidenceCards,
  serializeMessages,
  serializeScores,
  serializeStageStatus,
  type LastQuestionMeta as BaseLastQuestionMeta,
  type MotivationConversationContext as BaseMotivationConversationContext,
  type StageStatus,
} from "@/lib/motivation/conversation";
import { getMotivationConversationByCondition as getConversationByCondition } from "@/lib/motivation/conversation-store";
import { buildMotivationConversationPayload } from "@/lib/motivation/conversation-payload";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import {
  buildMotivationOwnerCondition,
  fetchMotivationApplicationJobCandidates,
  getOwnedMotivationCompanyData,
  isMotivationSetupComplete,
  resolveMotivationInputs,
} from "@/lib/motivation/motivation-input-resolver";

interface MotivationScores {
  company_understanding: number;
  self_analysis: number;
  career_vision: number;
  differentiation: number;
}

type LastQuestionMeta = BaseLastQuestionMeta;

type MotivationConversationContext = BaseMotivationConversationContext;
type MotivationProgress = BaseMotivationProgress;
type CausalGap = BaseCausalGap;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const requestId = getRequestId(request);
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "志望動機のAI支援はログインが必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const limitResponse = await guardDailyTokenLimit(identity);
    if (limitResponse) return limitResponse;

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...CONVERSATION_RATE_LAYERS],
      userId,
      guestId,
      "motivation_conversation_stream"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json();
    const { answer } = body;

    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return new Response(
        JSON.stringify({ error: "回答を入力してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get company
    const company = await getOwnedMotivationCompanyData(companyId, identity);

    if (!company) {
      return new Response(
        JSON.stringify({ error: "企業が見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get conversation
    const conversation = await getConversationByCondition(
      buildMotivationOwnerCondition(companyId, userId, guestId),
    );

    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "会話が見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
    const newQuestionCount = currentQuestionCount + 1;
    const profileContext = await fetchProfileContext(userId);
    const applicationJobCandidates = await fetchMotivationApplicationJobCandidates(companyId, userId, guestId);
    // Python (motivation._capture_answer_into_context) owns answer capture and
    // slot-state transitions. The TS side only builds a canonical context via
    // resolveMotivationInputs (industry/role resolution) and forwards raw messages.
    const resolvedInputs = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      parseConversationContext(conversation.conversationContext),
      applicationJobCandidates,
    );

    if (!isMotivationSetupComplete(resolvedInputs.conversationContext, resolvedInputs.requiresIndustrySelection)) {
      return new Response(
        JSON.stringify({ error: "先に業界・職種の設定を完了してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "先に質問を開始してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Credit check (1 credit per turn for logged-in users)
    const shouldConsumeCredit = !!userId;
    const billingContext = {
      userId: userId!,
      newQuestionCount,
      companyId,
    };
    const precheckResult = await motivationStreamPolicy.precheck(billingContext);
    if (!precheckResult.ok) {
      return precheckResult.errorResponse!;
    }

    // Add user answer to messages
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: answer.trim(),
    };
    messages.push(userMessage);

    const scores = safeParseScores(conversation.motivationScores);

    // Fetch gakuchika context for personalization
    const gakuchikaContext = userId ? await fetchGakuchikaContext(userId) : [];

    // Call FastAPI SSE streaming endpoint (with 60s timeout)
    const abortController = new AbortController();
    const fetchTimeoutId = setTimeout(() => abortController.abort(), 60_000);

    const principalPlan = await getViewerPlan(identity);

    let aiResponse: Response;
    try {
      aiResponse = await fetchFastApiWithPrincipal("/api/motivation/next-question/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        principal: {
          scope: "ai-stream",
          actor: userId
            ? { kind: "user", id: userId }
            : { kind: "guest", id: guestId! },
          companyId,
          plan: principalPlan,
        },
        body: JSON.stringify({
          company_id: company.id,
          company_name: company.name,
          industry: resolvedInputs.company.industry,
          generated_draft: conversation.generatedDraft ?? null,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          question_count: newQuestionCount,
          scores,
          gakuchika_context: gakuchikaContext.length > 0 ? gakuchikaContext : null,
          conversation_context: resolvedInputs.conversationContext,
          profile_context: profileContext,
          application_job_candidates: applicationJobCandidates.length > 0 ? applicationJobCandidates : null,
          company_role_candidates: resolvedInputs.companyRoleCandidates.length > 0 ? resolvedInputs.companyRoleCandidates : null,
          company_work_candidates: resolvedInputs.conversationContext.companyWorkCandidates.length > 0
            ? resolvedInputs.conversationContext.companyWorkCandidates
            : null,
          requires_industry_selection: resolvedInputs.requiresIndustrySelection,
          industry_options: resolvedInputs.industryOptions.length > 0 ? resolvedInputs.industryOptions : null,
        }),
        signal: abortController.signal,
      });
    } catch (fetchError) {
      clearTimeout(fetchTimeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        logAiCreditCostSummary({
          feature: "motivation",
          requestId,
          status: "failed",
          creditsUsed: 0,
          telemetry: null,
        });
        return new Response(
          JSON.stringify({ error: "AIの応答がタイムアウトしました。再度お試しください。" }),
          { status: 504, headers: { "Content-Type": "application/json" } }
        );
      }
      logAiCreditCostSummary({
        feature: "motivation",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      return new Response(
        JSON.stringify({ error: "AIサービスに接続できませんでした" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(fetchTimeoutId);
    }

    if (!aiResponse.ok) {
      const rawErrorBody = await aiResponse.json().catch(() => ({}));
      const { payload, telemetry } =
        rawErrorBody && typeof rawErrorBody === "object"
          ? splitInternalTelemetry(rawErrorBody as Record<string, unknown>)
          : { payload: rawErrorBody, telemetry: null as InternalCostTelemetry | null };
      logAiCreditCostSummary({
        feature: "motivation",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return new Response(
        JSON.stringify({
          error:
            (payload as { detail?: { error?: string } } | null)?.detail?.error ||
            "AIサービスに接続できませんでした",
        }),
        { status: aiResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Consume-and-re-emit via shared SSE proxy. DB persistence and credit
    // consumption happen inside the onComplete hook.
    let summaryLogged = false;
    let latestTelemetry: InternalCostTelemetry | null = null;
    let billingOutcomeStatus: "success" | "failed" | "cancelled" | null = null;
    let creditsAppliedForSummary = 0;

    const logSummaryOnce = (args: {
      status: "success" | "failed" | "cancelled";
      creditsUsed: number;
      telemetry?: InternalCostTelemetry | null;
    }) => {
      if (summaryLogged) return;
      summaryLogged = true;
      logAiCreditCostSummary({
        feature: "motivation",
        requestId,
        status: args.status,
        creditsUsed: args.creditsUsed,
        telemetry: args.telemetry ?? latestTelemetry,
      });
    };

    const stream = createSSEProxyStream(aiResponse, {
      feature: "motivation",
      requestId,
      onCostTelemetry: (telemetry) => {
        latestTelemetry = telemetry ?? latestTelemetry;
      },
      onComplete: async (event) => {
        const fastApiData = (event as {
          data: {
            question?: string;
            draft_ready?: boolean;
            evaluation?: { scores: MotivationScores; is_complete: boolean };
            captured_context?: Partial<MotivationConversationContext>;
            question_stage?: string;
            evidence_summary?: string | null;
            evidence_cards?: unknown[];
            coaching_focus?: string | null;
            risk_flags?: string[];
            stage_status?: unknown;
            conversation_mode?: "slot_fill" | "deepdive";
            current_slot?: string | null;
            current_intent?: string | null;
            next_advance_condition?: string | null;
            progress?: MotivationProgress | null;
            causal_gaps?: CausalGap[];
          };
        }).data;

        const currentDraftReadyState = resolveDraftReadyState(
          resolvedInputs.conversationContext,
          conversation.status as "in_progress" | "completed" | null,
        );
        const wasDraftReady = currentDraftReadyState.isDraftReady;
        let isDraftReady = wasDraftReady;
        let newScores = scores;

        if (fastApiData.question) {
          const aiMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fastApiData.question,
          };
          messages.push(aiMessage);
        }

        if (fastApiData.evaluation) {
          newScores = fastApiData.evaluation.scores;
          isDraftReady = isDraftReady || fastApiData.evaluation.is_complete;
        }
        isDraftReady = isDraftReady || Boolean(fastApiData.draft_ready);
        const draftReadyJustUnlocked = !wasDraftReady && isDraftReady;
        const nextConversationContext = mergeDraftReadyContext(
          {
            ...resolvedInputs.conversationContext,
            ...(fastApiData.captured_context || {}),
            lastQuestionMeta: {
              ...(((resolvedInputs.conversationContext.lastQuestionMeta || {}) as LastQuestionMeta)),
              ...((((fastApiData.captured_context?.lastQuestionMeta as LastQuestionMeta | undefined) || {}))),
              questionText: fastApiData.question || null,
            },
          },
          isDraftReady,
          currentDraftReadyState.unlockedAt ?? undefined,
        );

        // Update database with optimistic concurrency on updatedAt.
        const updatedRows = await db
          .update(motivationConversations)
          .set({
            messages: serializeMessages(messages),
            questionCount: newQuestionCount,
            status: isDraftReady ? "completed" : "in_progress",
            motivationScores: serializeScores(newScores ?? null),
            conversationContext: serializeConversationContext(nextConversationContext),
            selectedRole: nextConversationContext.selectedRole ?? null,
            selectedRoleSource: nextConversationContext.selectedRoleSource ?? null,
            desiredWork: nextConversationContext.desiredWork ?? null,
            questionStage:
              fastApiData.question_stage ??
              nextConversationContext.questionStage,
            lastEvidenceCards: serializeEvidenceCards(
              (fastApiData.evidence_cards || []) as EvidenceCard[],
            ),
            stageStatus: serializeStageStatus(
              ((fastApiData.stage_status as StageStatus | undefined) || {
                current: fastApiData.question_stage || resolvedInputs.conversationContext.questionStage,
                completed: [],
                pending: [],
              }) as StageStatus,
            ),
            updatedAt: new Date(),
          })
          .where(and(eq(motivationConversations.id, conversation.id), eq(motivationConversations.updatedAt, conversation.updatedAt)))
          .returning({ id: motivationConversations.id });

        if (updatedRows.length === 0) {
          // Optimistic concurrency conflict — emit conflict error and cancel stream.
          billingOutcomeStatus = "failed";
          return {
            replaceEvent: {
              type: "error",
              message: "別のタブまたは直前の操作で会話が更新されました。画面を再読み込みしてからやり直してください。",
            },
            cancel: true,
          };
        }

        // Billing failures must not roll back a successfully saved conversation.
        try {
          await motivationStreamPolicy.confirm(
            billingContext,
            {
              kind: "billable_success",
              creditsConsumed: shouldConsumeCredit ? CONVERSATION_CREDITS_PER_TURN : 0,
              freeQuotaUsed: false,
            },
            null,
          );
          billingOutcomeStatus = "success";
          creditsAppliedForSummary = shouldConsumeCredit ? CONVERSATION_CREDITS_PER_TURN : 0;
        } catch (billingError) {
          console.error("[Motivation Stream] Credit confirmation failed after save:", billingError);
          billingOutcomeStatus = "failed";
          creditsAppliedForSummary = 0;
        }

        // Build enriched replacement event for frontend.
        const payload = buildMotivationConversationPayload({
          messages,
          nextQuestion: fastApiData.question || null,
          questionCount: newQuestionCount,
          isDraftReady,
          scores: newScores,
          conversationContext: nextConversationContext,
          persistedQuestionStage:
            (fastApiData.question_stage as MotivationConversationContext["questionStage"] | null) ??
            nextConversationContext.questionStage,
          stageStatusValue: fastApiData.stage_status,
          evidenceSummary:
            typeof fastApiData.evidence_summary === "string"
              ? fastApiData.evidence_summary
              : null,
          evidenceCards: (fastApiData.evidence_cards || []) as EvidenceCard[],
          coachingFocus:
            typeof fastApiData.coaching_focus === "string"
              ? fastApiData.coaching_focus
              : null,
          riskFlags: Array.isArray(fastApiData.risk_flags) ? fastApiData.risk_flags : [],
          conversationMode:
            fastApiData.conversation_mode || nextConversationContext.conversationMode || "slot_fill",
          currentIntent: fastApiData.current_intent || null,
          nextAdvanceCondition: fastApiData.next_advance_condition || null,
          progress: fastApiData.progress || null,
          causalGaps: Array.isArray(fastApiData.causal_gaps) ? fastApiData.causal_gaps : [],
          resolvedIndustry: resolvedInputs.company.industry,
          requiresIndustrySelection: resolvedInputs.requiresIndustrySelection,
          isSetupComplete: true,
        });

        return {
          replaceEvent: {
            type: "complete",
            data: {
              ...payload,
              draftReadyJustUnlocked,
            },
          },
        };
      },
      onError: async () => {
        billingOutcomeStatus = "failed";
      },
      onFinally: () => {
        if (billingOutcomeStatus === "success") {
          logSummaryOnce({ status: "success", creditsUsed: creditsAppliedForSummary });
          void incrementDailyTokenCount(identity, computeTotalTokens(latestTelemetry));
        } else if (billingOutcomeStatus === "failed") {
          logSummaryOnce({ status: "failed", creditsUsed: 0 });
        } else {
          logSummaryOnce({ status: "cancelled", creditsUsed: 0 });
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error in motivation stream:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
