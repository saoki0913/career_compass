/**
 * Gakuchika Conversation SSE Stream API
 *
 * POST: Send answer and get next question via SSE streaming.
 * Proxies FastAPI SSE with "consume-and-re-emit" pattern:
 *   - progress events -> forwarded immediately
 *   - complete event -> DB save + credit consumption + summary if completed, then forwarded
 *   - error event -> forwarded (no credit consumed)
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
  FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS,
  buildHintPayload,
  buildConversationStatePatch,
  getGakuchikaNextAction,
  getIdentity,
  isInterviewReady,
  iterateGakuchikaFastApiSseEvents,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
  type ConversationState,
  type Message,
} from "@/app/api/gakuchika";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;
    const requestId = getRequestId(request);
    const identity = await getIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "ガクチカのAI深掘りはログインが必要です" }),
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
      "gakuchika_conversation_stream"
    );
    if (rateLimited) {
      return rateLimited;
    }

    // Verify gakuchika access
    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);

    if (!gakuchika) {
      return new Response(
        JSON.stringify({ error: "ガクチカが見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (userId && gakuchika.userId !== userId) {
      return new Response(
        JSON.stringify({ error: "ガクチカが見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
    if (guestId && gakuchika.guestId !== guestId) {
      return new Response(
        JSON.stringify({ error: "ガクチカが見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const { answer, sessionId } = body;

    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return new Response(
        JSON.stringify({ error: "回答を入力してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get conversation by sessionId or latest
    let conversation;
    if (sessionId) {
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .limit(1))[0];

      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return new Response(
          JSON.stringify({ error: "セッションが見つかりません" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1))[0];
    }

    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "会話が見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (conversation.status === "completed") {
      return new Response(
        JSON.stringify({ error: "このセッションは完了しています。新しいセッションを開始してください。" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
    const currentConversationState = safeParseConversationState(conversation.starScores, conversation.status);

    // Ensure the current question is in messages (same logic as non-stream POST)
    const lastAssistantMessage = messages.filter(m => m.role === "assistant").pop();
    if (!lastAssistantMessage || messages[messages.length - 1].role !== "assistant") {
      const currentQuestion = lastAssistantMessage
        ? lastAssistantMessage.content
        : `「${gakuchika.title}」について、具体的にどのようなことに取り組みましたか？`;
      messages.push({ id: crypto.randomUUID(), role: "assistant", content: currentQuestion });
    }

    // Add user answer
    messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: answer.trim(),
    });

    const newQuestionCount = currentQuestionCount + 1;

    // Credit check (1 credit per turn for logged-in users)
    const shouldConsumeCredit = !!userId;
    if (shouldConsumeCredit) {
      const precheckResult = await gakuchikaStreamPolicy.precheck({
        userId: userId!,
        gakuchikaId,
        newQuestionCount,
      });
      if (!precheckResult.ok) {
        return precheckResult.errorResponse!;
      }
    }

    // Call FastAPI SSE streaming endpoint (with 60s timeout)
    const abortController = new AbortController();
    const fetchTimeoutId = setTimeout(
      () => abortController.abort(),
      FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS,
    );

    const principalPlan = await getViewerPlan(identity);

    let aiResponse: Response;
    try {
      aiResponse = await fetchFastApiWithPrincipal("/api/gakuchika/next-question/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        principal: {
          scope: "ai-stream",
          actor: userId
            ? { kind: "user", id: userId }
            : { kind: "guest", id: guestId! },
          companyId: null,
          plan: principalPlan,
        },
        body: JSON.stringify({
          gakuchika_title: gakuchika.title,
          gakuchika_content: gakuchika.content || null,
          char_limit_type: gakuchika.charLimitType || null,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          question_count: newQuestionCount,
          conversation_state: currentConversationState
            ? {
                stage: currentConversationState.stage,
                focus_key: currentConversationState.focusKey,
                progress_label: currentConversationState.progressLabel,
                answer_hint: currentConversationState.answerHint,
                input_richness_mode: currentConversationState.inputRichnessMode,
                missing_elements: currentConversationState.missingElements,
                draft_quality_checks: currentConversationState.draftQualityChecks,
                causal_gaps: currentConversationState.causalGaps,
                completion_checks: currentConversationState.completionChecks,
                ready_for_draft: currentConversationState.readyForDraft,
                draft_readiness_reason: currentConversationState.draftReadinessReason,
                draft_text: currentConversationState.draftText,
                  strength_tags: currentConversationState.strengthTags,
                  issue_tags: currentConversationState.issueTags,
                  deepdive_recommendation_tags: currentConversationState.deepdiveRecommendationTags,
                  credibility_risk_tags: currentConversationState.credibilityRiskTags,
                  deepdive_stage: currentConversationState.deepdiveStage,
                  deepdive_complete: currentConversationState.deepdiveComplete,
                  completion_reasons: currentConversationState.completionReasons,
                  asked_focuses: currentConversationState.askedFocuses,
                  resolved_focuses: currentConversationState.resolvedFocuses,
                  deferred_focuses: currentConversationState.deferredFocuses,
                  blocked_focuses: currentConversationState.blockedFocuses,
                  focus_attempt_counts: currentConversationState.focusAttemptCounts,
                  last_question_signature: currentConversationState.lastQuestionSignature,
                  extended_deep_dive_round: currentConversationState.extendedDeepDiveRound,
              }
            : null,
        }),
        signal: abortController.signal,
      });
    } catch (fetchError) {
      clearTimeout(fetchTimeoutId);
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        logAiCreditCostSummary({
          feature: "gakuchika",
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
        feature: "gakuchika",
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
        feature: "gakuchika",
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

    // Consume-and-re-emit: intercept SSE events, process complete event
    const fastApiBody = aiResponse.body;
    if (!fastApiBody) {
      logAiCreditCostSummary({
        feature: "gakuchika",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      return new Response(
        JSON.stringify({ error: "AIレスポンスが空です" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    let summaryLogged = false;
    let latestTelemetry: InternalCostTelemetry | null = null;

    const logSummaryOnce = (args: {
      status: "success" | "failed" | "cancelled";
      creditsUsed: number;
      telemetry?: InternalCostTelemetry | null;
    }) => {
      if (summaryLogged) {
        return;
      }
      summaryLogged = true;
      logAiCreditCostSummary({
        feature: "gakuchika",
        requestId,
        status: args.status,
        creditsUsed: args.creditsUsed,
        telemetry: args.telemetry ?? latestTelemetry,
      });
    };

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let streamedQuestionText = "";
        let hasStartedQuestionStream = false;
        let partialState: Partial<ConversationState> = {};

        try {
          for await (const { event, telemetry } of iterateGakuchikaFastApiSseEvents(fastApiBody)) {
            latestTelemetry = telemetry ?? latestTelemetry;

            if (event.type === "progress" && !hasStartedQuestionStream) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (
              event.type === "string_chunk" &&
              event.path === "question" &&
              typeof event.text === "string"
            ) {
              hasStartedQuestionStream = true;
              streamedQuestionText += event.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === "field_complete") {
              if (event.path === "focus_key" && typeof event.value === "string") {
                partialState = { ...partialState, focusKey: event.value as ConversationState["focusKey"] };
              } else if (event.path === "answer_hint" && typeof event.value === "string") {
                partialState = { ...partialState, answerHint: event.value };
              } else if (event.path === "progress_label" && typeof event.value === "string") {
                partialState = { ...partialState, progressLabel: event.value };
              } else if (event.path === "ready_for_draft") {
                partialState = { ...partialState, readyForDraft: Boolean(event.value) };
              } else if (event.path === "deepdive_stage" && typeof event.value === "string") {
                partialState = { ...partialState, deepdiveStage: event.value };
              }
              const hintPayload = buildHintPayload(
                buildConversationStatePatch(currentConversationState, partialState),
              );
              if (hintPayload) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "hint_ready", data: hintPayload })}\n\n`),
                );
              }
            } else if (event.type === "complete") {
              const fastApiData = (event as {
                data: {
                  question?: string;
                  conversation_state?: Record<string, unknown>;
                  next_action?: string;
                };
              }).data;

              const nextQuestionText =
                typeof fastApiData.question === "string" && fastApiData.question
                  ? fastApiData.question
                  : streamedQuestionText;

              const nextConversationState = fastApiData.conversation_state
                ? safeParseConversationState(JSON.stringify(fastApiData.conversation_state))
                : buildConversationStatePatch(currentConversationState, partialState);
              const nextAction =
                typeof fastApiData.next_action === "string"
                  ? fastApiData.next_action
                  : getGakuchikaNextAction(nextConversationState);
              const shouldAskNext = nextAction === "ask";
              const isCompleted = nextConversationState.stage === "interview_ready";
              const status = isCompleted ? "completed" : "in_progress";

              if (shouldAskNext && nextQuestionText) {
                const aiMessage: Message = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: nextQuestionText,
                };
                messages.push(aiMessage);
              }

              await db
                .update(gakuchikaConversations)
                .set({
                  messages,
                  questionCount: newQuestionCount,
                  status,
                  starScores: serializeConversationState(nextConversationState),
                  updatedAt: new Date(),
                })
                .where(eq(gakuchikaConversations.id, conversation.id));

              if (shouldConsumeCredit) {
                try {
                  await gakuchikaStreamPolicy.confirm(
                    {
                      userId: userId!,
                      gakuchikaId,
                      newQuestionCount,
                    },
                    {
                      kind: "billable_success",
                      creditsConsumed: CONVERSATION_CREDITS_PER_TURN,
                      freeQuotaUsed: false,
                    },
                    null,
                  );
                } catch (billingError) {
                  console.error("[Gakuchika Stream] Credit confirmation failed after save:", billingError);
                }
              }

              if (nextConversationState.stage === "interview_ready" && nextConversationState.draftText) {
                const summaryMessages = messages.map((message) => ({ ...message }));
                after(async () => {
                  await persistGakuchikaSummary(
                    gakuchikaId,
                    gakuchika.title,
                    nextConversationState.draftText!,
                    summaryMessages
                  );
                });
              }

              const enrichedEvent = {
                type: "complete",
                data: {
                  messages,
                  nextQuestion: shouldAskNext ? nextQuestionText : null,
                  questionCount: newQuestionCount,
                  isCompleted,
                  conversationState: nextConversationState,
                  nextAction,
                  isInterviewReady: isInterviewReady(nextConversationState),
                  isAIPowered: true,
                  summaryPending: nextConversationState.stage === "interview_ready",
                },
              };
              logSummaryOnce({
                status: "success",
                creditsUsed: shouldConsumeCredit ? CONVERSATION_CREDITS_PER_TURN : 0,
              });
              void incrementDailyTokenCount(identity, computeTotalTokens(latestTelemetry));
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(enrichedEvent)}\n\n`)
              );
            } else if (event.type === "error") {
              logSummaryOnce({
                status: "failed",
                creditsUsed: 0,
              });
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
          }
        } catch (err) {
          console.error("[Gakuchika Stream] Error processing SSE:", err);
          const errorEvent = {
            type: "error",
            message: "ストリーミング処理中にエラーが発生しました",
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
          );
          logSummaryOnce({
            status: "failed",
            creditsUsed: 0,
          });
        } finally {
          if (!summaryLogged) {
            logSummaryOnce({
              status: "cancelled",
              creditsUsed: 0,
            });
          }
          controller.close();
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
    console.error("Error in gakuchika stream:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
