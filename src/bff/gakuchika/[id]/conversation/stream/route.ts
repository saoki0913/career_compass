import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { CONVERSATION_CREDITS_PER_TURN } from "@/lib/credits";
import { gakuchikaStreamPolicy } from "@/bff/billing/gakuchika-stream-policy";
import {
  getGakuchikaNextAction,
  isInterviewReady,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
  type ConversationState,
} from "@/bff/gakuchika";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { logAiCreditCostSummary } from "@/lib/ai/cost-summary-log";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import { createGakuchikaStreamStateMachine } from "@/lib/gakuchika/stream-state-machine";
import { reopenGakuchikaConversationState } from "@/lib/gakuchika/conversation-reopen";
import { createConversationStreamHandler } from "@/bff/api/stream-handler";
import { createApiErrorResponse } from "@/bff/api/error-response";
import type { SSEProxyProgressResult } from "@/lib/fastapi/sse-proxy";
import type { CreateCareerPrincipalInput } from "@/lib/fastapi/career-principal";

function toSnakeState(s: ConversationState): Record<string, unknown> {
  return {
    stage: s.stage, focus_key: s.focusKey, progress_label: s.progressLabel,
    answer_hint: s.answerHint, input_richness_mode: s.inputRichnessMode,
    missing_elements: s.missingElements, draft_quality_checks: s.draftQualityChecks,
    causal_gaps: s.causalGaps, completion_checks: s.completionChecks,
    ready_for_draft: s.readyForDraft, draft_readiness_reason: s.draftReadinessReason,
    draft_text: s.draftText, draft_document_id: s.draftDocumentId, summary_stale: s.summaryStale,
    strength_tags: s.strengthTags, issue_tags: s.issueTags,
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

interface GakuchikaStreamContext {
  gakuchikaId: string;
  userId: string;
  gakuchika: { title: string; content: string | null; charLimitType: string | null };
  conversationId: string;
  conversationUpdatedAt: Date;
  messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
  newQC: number;
  curState: ConversationState | null;
  shouldConsumeCredit: boolean;
  reservationId: string | null;
  stateMachine: ReturnType<typeof createGakuchikaStreamStateMachine>;
  principal: CreateCareerPrincipalInput;
  streamedQ: string;
  billingOutcomeStatus: "success" | "failed" | "cancelled" | null;
  creditsAppliedForSummary: number;
}

export const POST = createConversationStreamHandler<GakuchikaStreamContext>({
  feature: "gakuchika",
  rateLimit: true,
  errorMeta: {
    authCode: "GAKUCHIKA_STREAM_AUTH_REQUIRED",
    authMessage: "ガクチカのAI深掘りはログインが必要です",
  },

  async prepare({ paramId: gakuchikaId, identity, answer, body, request }) {
    const { userId, guestId } = identity;

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);
    if (!gakuchika) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "GAKUCHIKA_NOT_FOUND",
        userMessage: "ガクチカが見つかりません",
      });
    }
    if (userId && gakuchika.userId !== userId) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "GAKUCHIKA_NOT_FOUND",
        userMessage: "ガクチカが見つかりません",
      });
    }
    if (guestId && gakuchika.guestId !== guestId) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "GAKUCHIKA_NOT_FOUND",
        userMessage: "ガクチカが見つかりません",
      });
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    let conversation;
    if (sessionId) {
      conversation = (
        await db
          .select()
          .from(gakuchikaConversations)
          .where(eq(gakuchikaConversations.id, sessionId))
          .limit(1)
      )[0];
      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "GAKUCHIKA_SESSION_NOT_FOUND",
          userMessage: "セッションが見つかりません",
        });
      }
    } else {
      conversation = (
        await db
          .select()
          .from(gakuchikaConversations)
          .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
          .orderBy(desc(gakuchikaConversations.updatedAt))
          .limit(1)
      )[0];
    }
    if (!conversation) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "GAKUCHIKA_CONVERSATION_NOT_FOUND",
        userMessage: "会話が見つかりません",
      });
    }
    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
    let curState = safeParseConversationState(conversation.starScores, conversation.status);
    const pausedQuestion = curState.pausedQuestion?.trim();
    if (getGakuchikaNextAction(curState) !== "ask" && pausedQuestion) {
      const alreadyLastAssistant =
        messages.length > 0 &&
        messages[messages.length - 1].role === "assistant" &&
        messages[messages.length - 1].content.trim() === pausedQuestion;
      if (!alreadyLastAssistant) {
        messages.push({ id: crypto.randomUUID(), role: "assistant", content: pausedQuestion });
      }
    }
    curState = reopenGakuchikaConversationState(curState);
    const lastAssistant = messages.filter((m) => m.role === "assistant").pop();
    if (!lastAssistant || messages[messages.length - 1].role !== "assistant") {
      messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: lastAssistant
          ? lastAssistant.content
          : `「${gakuchika.title}」について、具体的にどのようなことに取り組みましたか？`,
      });
    }
    messages.push({ id: crypto.randomUUID(), role: "user", content: answer });
    const newQC = currentQuestionCount + 1;

    const shouldConsumeCredit = !!userId;
    let reservationId: string | null = null;
    if (shouldConsumeCredit) {
      const pc = await gakuchikaStreamPolicy.precheck({
        userId: userId!,
        gakuchikaId,
        newQuestionCount: newQC,
      });
      if (!pc.ok) return pc.errorResponse!;
      const reserveResult = await gakuchikaStreamPolicy.reserve?.(
        {
          userId: userId!,
          gakuchikaId,
          newQuestionCount: newQC,
        },
        CONVERSATION_CREDITS_PER_TURN,
      );
      if (reserveResult?.errorResponse) return reserveResult.errorResponse;
      reservationId = reserveResult?.reservationId ?? null;
    }

    let principalPlan: Awaited<ReturnType<typeof getViewerPlan>>;
    try {
      principalPlan = await getViewerPlan(identity);
    } catch (error) {
      await gakuchikaStreamPolicy.cancel(
        {
          userId: userId!,
          gakuchikaId,
          newQuestionCount: newQC,
        },
        reservationId,
        "prepare_failed",
      );
      throw error;
    }

    return {
      gakuchikaId,
      userId: userId!,
      gakuchika,
      conversationId: conversation.id,
      conversationUpdatedAt: conversation.updatedAt,
      messages,
      newQC,
      curState,
      shouldConsumeCredit,
      reservationId,
      stateMachine: createGakuchikaStreamStateMachine(curState),
      principal: {
        scope: "ai-stream" as const,
        actor: userId
          ? { kind: "user" as const, id: userId }
          : { kind: "guest" as const, id: guestId! },
        companyId: null,
        plan: principalPlan,
      },
      streamedQ: "",
      billingOutcomeStatus: null,
      creditsAppliedForSummary: 0,
    };
  },

  getUpstream(ctx) {
    return {
      payload: {
        gakuchika_title: ctx.gakuchika.title,
        gakuchika_content: ctx.gakuchika.content || null,
        char_limit_type: ctx.gakuchika.charLimitType || null,
        conversation_history: ctx.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        question_count: ctx.newQC,
        conversation_state: ctx.curState ? toSnakeState(ctx.curState) : null,
      },
      principal: ctx.principal,
    };
  },

  onProgress(ctx, ev): SSEProxyProgressResult | void {
    if (ev.type === "string_chunk" && ev.path === "question" && typeof ev.text === "string") {
      ctx.streamedQ += ev.text;
    }
    return ctx.stateMachine.processEvent(ev);
  },

  async onComplete(ctx, ev, { telemetry, identity }) {
    const d = (
      ev as {
        data: {
          question?: string;
          conversation_state?: Record<string, unknown>;
          next_action?: string;
        };
      }
    ).data;
    const qText =
      typeof d.question === "string" && d.question ? d.question : ctx.streamedQ;
    const parsedState = d.conversation_state
      ? safeParseConversationState(JSON.stringify(d.conversation_state))
      : ctx.stateMachine.getMergedState();
    const mergedState = {
      ...parsedState,
      pausedQuestion: qText.trim() || parsedState.pausedQuestion,
    };
    const ns =
      mergedState.stage === "interview_ready" && !mergedState.draftText
        ? {
            ...mergedState,
            stage: "deep_dive_active" as const,
            deepdiveComplete: false,
            deepdiveStage: "es_aftercare",
            progressLabel: "深掘り中",
            pausedQuestion: qText.trim() || mergedState.pausedQuestion,
          }
        : mergedState;
    const na = getGakuchikaNextAction(ns);
    const ask = na === "ask";
    ns.pausedQuestion = ask ? null : qText.trim() || ns.pausedQuestion;
    const done = isInterviewReady(ns);
    if (ask && qText) {
      ctx.messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: qText,
      });
    }
    const updatedRows = await db
      .update(gakuchikaConversations)
      .set({
        messages: ctx.messages,
        questionCount: ctx.newQC,
        status: done ? "completed" : "in_progress",
        starScores: serializeConversationState(ns),
        updatedAt: new Date(),
      })
      .where(and(
        eq(gakuchikaConversations.id, ctx.conversationId),
        eq(gakuchikaConversations.updatedAt, ctx.conversationUpdatedAt),
      ))
      .returning({ id: gakuchikaConversations.id });
    if (updatedRows.length === 0) {
      ctx.billingOutcomeStatus = "failed";
      ctx.creditsAppliedForSummary = 0;
      return {
        replaceEvent: {
          type: "error",
          message: "別のタブまたは直前の操作で会話が更新されました。画面を再読み込みしてからやり直してください。",
        },
        cancel: true,
      };
    }
    if (ctx.shouldConsumeCredit) {
      try {
        await gakuchikaStreamPolicy.confirm(
          {
            userId: ctx.userId,
            gakuchikaId: ctx.gakuchikaId,
            newQuestionCount: ctx.newQC,
          },
          {
            kind: "billable_success",
            creditsConsumed: CONVERSATION_CREDITS_PER_TURN,
            freeQuotaUsed: false,
          },
          ctx.reservationId,
        );
        ctx.billingOutcomeStatus = "success";
        ctx.creditsAppliedForSummary = CONVERSATION_CREDITS_PER_TURN;
      } catch {
        ctx.billingOutcomeStatus = "failed";
        ctx.creditsAppliedForSummary = 0;
      }
    } else {
      ctx.billingOutcomeStatus = "success";
      ctx.creditsAppliedForSummary = 0;
    }
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));
    return {
      replaceEvent: {
        type: "complete",
        data: {
          messages: ctx.messages,
          nextQuestion: ask ? qText : null,
          questionCount: ctx.newQC,
          isCompleted: done,
          conversationState: ns,
          nextAction: na,
          isInterviewReady: isInterviewReady(ns),
          isAIPowered: true,
        },
      },
    };
  },

  async onStreamError(ctx) {
    ctx.billingOutcomeStatus = "failed";
    ctx.creditsAppliedForSummary = 0;
    await gakuchikaStreamPolicy.cancel(
      {
        userId: ctx.userId,
        gakuchikaId: ctx.gakuchikaId,
        newQuestionCount: ctx.newQC,
      },
      ctx.reservationId,
      "stream_error",
    );
  },

  async onFinally(_ctx, { success, telemetry }) {
    if (_ctx.billingOutcomeStatus === "success") {
      logAiCreditCostSummary({
        feature: "gakuchika",
        requestId: "",
        status: "success",
        creditsUsed: _ctx.creditsAppliedForSummary,
        telemetry,
      });
    } else if (_ctx.billingOutcomeStatus === "failed") {
      await gakuchikaStreamPolicy.cancel(
        {
          userId: _ctx.userId,
          gakuchikaId: _ctx.gakuchikaId,
          newQuestionCount: _ctx.newQC,
        },
        _ctx.reservationId,
        "failed",
      );
      logAiCreditCostSummary({
        feature: "gakuchika",
        requestId: "",
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
    } else if (!success) {
      await gakuchikaStreamPolicy.cancel(
        {
          userId: _ctx.userId,
          gakuchikaId: _ctx.gakuchikaId,
          newQuestionCount: _ctx.newQC,
        },
        _ctx.reservationId,
        "cancelled_or_incomplete",
      );
      logAiCreditCostSummary({
        feature: "gakuchika",
        requestId: "",
        status: "cancelled",
        creditsUsed: 0,
        telemetry,
      });
    }
  },
});
