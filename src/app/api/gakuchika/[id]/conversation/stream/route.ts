/**
 * Gakuchika Conversation SSE Stream API — POST: answer + next question via SSE.
 * Uses shared SSE infrastructure (fetchUpstreamSSE + createSSEProxyStream).
 */
import { after, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { CONVERSATION_CREDITS_PER_TURN } from "@/lib/credits";
import { gakuchikaStreamPolicy } from "@/lib/api-route/billing/gakuchika-stream-policy";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { persistGakuchikaSummary } from "@/app/api/gakuchika/summary-server";
import {
  getGakuchikaNextAction, getIdentity, isInterviewReady,
  safeParseConversationState, safeParseMessages, serializeConversationState,
  type ConversationState,
} from "@/app/api/gakuchika";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { getRequestId, logAiCreditCostSummary, splitInternalTelemetry, type InternalCostTelemetry } from "@/lib/ai/cost-summary-log";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import { STREAM_FEATURE_CONFIGS } from "@/lib/fastapi/stream-config";
import {
  createConfiguredSSEProxyResponse,
  fetchConfiguredUpstreamSSE,
} from "@/lib/fastapi/stream-pipeline";
import { createGakuchikaStreamStateMachine } from "@/lib/gakuchika/stream-state-machine";

const jsonErr = (msg: string, status: number) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { "Content-Type": "application/json" } });

/** camelCase ConversationState -> snake_case payload for FastAPI */
function toSnakeState(s: ConversationState): Record<string, unknown> {
  return {
    stage: s.stage, focus_key: s.focusKey, progress_label: s.progressLabel,
    answer_hint: s.answerHint, input_richness_mode: s.inputRichnessMode,
    missing_elements: s.missingElements, draft_quality_checks: s.draftQualityChecks,
    causal_gaps: s.causalGaps, completion_checks: s.completionChecks,
    ready_for_draft: s.readyForDraft, draft_readiness_reason: s.draftReadinessReason,
    draft_text: s.draftText, strength_tags: s.strengthTags, issue_tags: s.issueTags,
    deepdive_recommendation_tags: s.deepdiveRecommendationTags,
    credibility_risk_tags: s.credibilityRiskTags, deepdive_stage: s.deepdiveStage,
    deepdive_complete: s.deepdiveComplete, completion_reasons: s.completionReasons,
    asked_focuses: s.askedFocuses, resolved_focuses: s.resolvedFocuses,
    deferred_focuses: s.deferredFocuses, blocked_focuses: s.blockedFocuses,
    recent_question_texts: s.recentQuestionTexts, loop_blocked_focuses: s.loopBlockedFocuses,
    focus_attempt_counts: s.focusAttemptCounts, last_question_signature: s.lastQuestionSignature,
    extended_deep_dive_round: s.extendedDeepDiveRound,
    paused_question: s.pausedQuestion,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: gakuchikaId } = await params;
    const requestId = getRequestId(request);
    const identity = await getIdentity(request);
    if (!identity) return jsonErr("認証が必要です", 401);
    const { userId, guestId } = identity;
    if (!userId) return jsonErr("ガクチカのAI深掘りはログインが必要です", 401);
    const limitResponse = await guardDailyTokenLimit(identity);
    if (limitResponse) return limitResponse;
    const rateLimited = await enforceRateLimitLayers(request, [...CONVERSATION_RATE_LAYERS], userId, guestId, "gakuchika_conversation_stream");
    if (rateLimited) return rateLimited;

    const [gakuchika] = await db.select().from(gakuchikaContents).where(eq(gakuchikaContents.id, gakuchikaId)).limit(1);
    if (!gakuchika) return jsonErr("ガクチカが見つかりません", 404);
    if (userId && gakuchika.userId !== userId) return jsonErr("ガクチカが見つかりません", 404);
    if (guestId && gakuchika.guestId !== guestId) return jsonErr("ガクチカが見つかりません", 404);

    const body = await request.json();
    const { answer, sessionId } = body;
    if (!answer || typeof answer !== "string" || !answer.trim()) return jsonErr("回答を入力してください", 400);

    let conversation;
    if (sessionId) {
      conversation = (await db.select().from(gakuchikaConversations).where(eq(gakuchikaConversations.id, sessionId)).limit(1))[0];
      if (!conversation || conversation.gakuchikaId !== gakuchikaId) return jsonErr("セッションが見つかりません", 404);
    } else {
      conversation = (await db.select().from(gakuchikaConversations).where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId)).orderBy(desc(gakuchikaConversations.updatedAt)).limit(1))[0];
    }
    if (!conversation) return jsonErr("会話が見つかりません", 404);
    if (conversation.status === "completed") return jsonErr("このセッションは完了しています。新しいセッションを開始してください。", 409);

    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
    const curState = safeParseConversationState(conversation.starScores, conversation.status);
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();
    if (!lastAssistant || messages[messages.length - 1].role !== "assistant") {
      messages.push({ id: crypto.randomUUID(), role: "assistant", content: lastAssistant ? lastAssistant.content : `「${gakuchika.title}」について、具体的にどのようなことに取り組みましたか？` });
    }
    messages.push({ id: crypto.randomUUID(), role: "user", content: answer.trim() });
    const newQC = currentQuestionCount + 1;

    const shouldConsumeCredit = !!userId;
    if (shouldConsumeCredit) {
      const pc = await gakuchikaStreamPolicy.precheck({ userId: userId!, gakuchikaId, newQuestionCount: newQC });
      if (!pc.ok) return pc.errorResponse!;
    }

    const principalPlan = await getViewerPlan(identity);
    const streamConfig = STREAM_FEATURE_CONFIGS.gakuchika;
    let upstream: Awaited<ReturnType<typeof fetchConfiguredUpstreamSSE>>;
    try {
      upstream = await fetchConfiguredUpstreamSSE({
        config: streamConfig,
        requestId,
        principal: { scope: "ai-stream", actor: userId ? { kind: "user", id: userId } : { kind: "guest", id: guestId! }, companyId: null, plan: principalPlan },
        payload: {
          gakuchika_title: gakuchika.title, gakuchika_content: gakuchika.content || null,
          char_limit_type: gakuchika.charLimitType || null,
          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
          question_count: newQC, conversation_state: curState ? toSnakeState(curState) : null,
        },
      });
    } catch (fetchError) {
      const s = fetchError instanceof Error && fetchError.name === "AbortError" ? 504 : 502;
      logAiCreditCostSummary({ feature: "gakuchika", requestId, status: "failed", creditsUsed: 0, telemetry: null });
      return jsonErr(s === 504 ? "AIの応答がタイムアウトしました。再度お試しください。" : "AIサービスに接続できませんでした", s);
    }

    if (!upstream.response.ok) {
      upstream.clearTimeout();
      const raw = await upstream.response.json().catch(() => ({}));
      const { payload, telemetry } = raw && typeof raw === "object" ? splitInternalTelemetry(raw as Record<string, unknown>) : { payload: raw, telemetry: null as InternalCostTelemetry | null };
      logAiCreditCostSummary({ feature: "gakuchika", requestId, status: "failed", creditsUsed: 0, telemetry });
      return jsonErr((payload as { detail?: { error?: string } } | null)?.detail?.error || "AIサービスに接続できませんでした", upstream.response.status);
    }

    const sm = createGakuchikaStreamStateMachine(curState);
    let streamedQ = "";
    let latestTelemetry: InternalCostTelemetry | null = null;
    let summaryLogged = false;
    const logOnce = (st: "success" | "failed" | "cancelled", cr: number) => {
      if (summaryLogged) return;
      summaryLogged = true;
      logAiCreditCostSummary({ feature: "gakuchika", requestId, status: st, creditsUsed: cr, telemetry: latestTelemetry });
    };

    return createConfiguredSSEProxyResponse({
      config: streamConfig,
      upstreamResponse: upstream.response,
      clearUpstreamTimeout: upstream.clearTimeout,
      requestId,
      onProgress: (ev) => {
        if (ev.type === "string_chunk" && ev.path === "question" && typeof ev.text === "string") streamedQ += ev.text;
        return sm.processEvent(ev);
      },
      onCostTelemetry: (t) => { latestTelemetry = t ?? latestTelemetry; },
      onComplete: async (ev) => {
        const d = (ev as { data: { question?: string; conversation_state?: Record<string, unknown>; next_action?: string } }).data;
        const qText = typeof d.question === "string" && d.question ? d.question : streamedQ;
        const parsedState = d.conversation_state ? safeParseConversationState(JSON.stringify(d.conversation_state)) : sm.getMergedState();
        const na = typeof d.next_action === "string" ? d.next_action : getGakuchikaNextAction(parsedState);
        const ask = na === "ask";
        const ns = {
          ...parsedState,
          pausedQuestion: ask ? null : qText.trim() || parsedState.pausedQuestion,
        };
        const done = ns.stage === "interview_ready";
        if (ask && qText) messages.push({ id: crypto.randomUUID(), role: "assistant", content: qText });
        await db.update(gakuchikaConversations).set({
          messages, questionCount: newQC, status: done ? "completed" : "in_progress",
          starScores: serializeConversationState(ns), updatedAt: new Date(),
        }).where(eq(gakuchikaConversations.id, conversation.id));
        if (shouldConsumeCredit) {
          try { await gakuchikaStreamPolicy.confirm({ userId: userId!, gakuchikaId, newQuestionCount: newQC }, { kind: "billable_success", creditsConsumed: CONVERSATION_CREDITS_PER_TURN, freeQuotaUsed: false }, null); }
          catch (e) { console.error("[Gakuchika Stream] Credit confirmation failed:", e); }
        }
        if (ns.stage === "interview_ready" && ns.draftText) {
          const snap = messages.map(m => ({ ...m }));
          after(async () => { try { await persistGakuchikaSummary(gakuchikaId, gakuchika.title, ns.draftText!, snap); } catch (e) { console.error("[Gakuchika Stream] persistGakuchikaSummary failed:", e); } });
        }
        logOnce("success", shouldConsumeCredit ? CONVERSATION_CREDITS_PER_TURN : 0);
        void incrementDailyTokenCount(identity, computeTotalTokens(latestTelemetry));
        return { replaceEvent: { type: "complete", data: {
          messages, nextQuestion: ask ? qText : null, questionCount: newQC, isCompleted: done,
          conversationState: ns, nextAction: na, isInterviewReady: isInterviewReady(ns),
          isAIPowered: true, summaryPending: ns.stage === "interview_ready",
        } } };
      },
      onError: async () => { logOnce("failed", 0); },
      onFinally: async () => { if (!summaryLogged) logOnce("cancelled", 0); },
    });
  } catch (error) {
    console.error("Error in gakuchika stream:", error);
    return jsonErr("Internal server error", 500);
  }
}
