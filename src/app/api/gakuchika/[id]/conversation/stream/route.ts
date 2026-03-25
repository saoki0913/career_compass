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
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { persistGakuchikaSummary } from "@/app/api/gakuchika/summary-server";
import {
  FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS,
  FASTAPI_URL,
  QUESTIONS_PER_CREDIT,
  CREDITS_PER_QUESTION_BATCH,
  buildHintPayload,
  getIdentity,
  getWeakestElement,
  isStarComplete,
  iterateGakuchikaFastApiSseEvents,
  safeParseMessages,
  safeParseStarScores,
  type Message,
  type STAREvaluation,
} from "@/app/api/gakuchika/shared";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";

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
    const currentStarScores = safeParseStarScores(conversation.starScores);

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

    // Credit check (every QUESTIONS_PER_CREDIT questions for logged-in users)
    const shouldConsumeCredit = newQuestionCount > 0 && newQuestionCount % QUESTIONS_PER_CREDIT === 0 && !!userId;
    if (shouldConsumeCredit) {
      const canPay = await hasEnoughCredits(userId!, CREDITS_PER_QUESTION_BATCH);
      if (!canPay) {
        return new Response(
          JSON.stringify({ error: "クレジットが不足しています" }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Call FastAPI SSE streaming endpoint (with 60s timeout)
    const abortController = new AbortController();
    const fetchTimeoutId = setTimeout(
      () => abortController.abort(),
      FASTAPI_GAKUCHIKA_STREAM_TIMEOUT_MS,
    );

    let aiResponse: Response;
    try {
      aiResponse = await fetch(`${FASTAPI_URL}/api/gakuchika/next-question/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        body: JSON.stringify({
          gakuchika_title: gakuchika.title,
          gakuchika_content: gakuchika.content || null,
          char_limit_type: gakuchika.charLimitType || null,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          question_count: newQuestionCount,
          star_scores: currentStarScores || null,
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
        let hintedTargetElement: string | null = getWeakestElement(currentStarScores);

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
            } else if (
              event.type === "field_complete" &&
              event.path === "star_scores" &&
              event.value &&
              typeof event.value === "object"
            ) {
              const partialScores = {
                situation: Number((event.value as Record<string, unknown>).situation ?? 0),
                task: Number((event.value as Record<string, unknown>).task ?? 0),
                action: Number((event.value as Record<string, unknown>).action ?? 0),
                result: Number((event.value as Record<string, unknown>).result ?? 0),
              };
              hintedTargetElement = getWeakestElement(partialScores);
              const hintPayload = buildHintPayload(hintedTargetElement);
              if (hintPayload) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "hint_ready", data: hintPayload })}\n\n`)
                );
              }
            } else if (event.type === "complete") {
              const fastApiData = (event as {
                data: {
                  question?: string;
                  target_element?: string;
                  star_evaluation?: STAREvaluation;
                };
              }).data;

              if (shouldConsumeCredit) {
                await consumeCredits(userId!, CREDITS_PER_QUESTION_BATCH, "gakuchika", gakuchikaId);
              }

              let newStarScores = currentStarScores || { situation: 0, task: 0, action: 0, result: 0 };
              let starEvaluation: STAREvaluation | null = null;
              let targetElement: string | null =
                typeof fastApiData.target_element === "string"
                  ? fastApiData.target_element
                  : hintedTargetElement;
              const nextQuestionText =
                typeof fastApiData.question === "string" && fastApiData.question
                  ? fastApiData.question
                  : streamedQuestionText;

              if (nextQuestionText) {
                const aiMessage: Message = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: nextQuestionText,
                };
                messages.push(aiMessage);
              }

              if (fastApiData.star_evaluation) {
                starEvaluation = fastApiData.star_evaluation;
                newStarScores = fastApiData.star_evaluation.scores;
                targetElement =
                  (typeof fastApiData.target_element === "string" && fastApiData.target_element) ||
                  fastApiData.star_evaluation.weakest_element || getWeakestElement(newStarScores);
              }

              if (!targetElement) {
                targetElement = getWeakestElement(newStarScores);
              }

              const starComplete = isStarComplete(newStarScores);
              const isCompleted = starComplete || (starEvaluation?.is_complete ?? false);
              const status = isCompleted ? "completed" : "in_progress";

              await db
                .update(gakuchikaConversations)
                .set({
                  messages: JSON.stringify(messages),
                  questionCount: newQuestionCount,
                  status,
                  starScores: JSON.stringify(newStarScores),
                  updatedAt: new Date(),
                })
                .where(eq(gakuchikaConversations.id, conversation.id));

              if (isCompleted) {
                const summaryMessages = messages.map((message) => ({ ...message }));
                after(async () => {
                  await persistGakuchikaSummary(
                    gakuchikaId,
                    gakuchika.title,
                    summaryMessages
                  );
                });
              }

              const enrichedEvent = {
                type: "complete",
                data: {
                  messages,
                  nextQuestion: isCompleted ? null : nextQuestionText,
                  questionCount: newQuestionCount,
                  isCompleted,
                  starScores: newStarScores,
                  starEvaluation,
                  targetElement,
                  isAIPowered: true,
                  summaryPending: isCompleted,
                },
              };
              logSummaryOnce({
                status: "success",
                creditsUsed: shouldConsumeCredit ? CREDITS_PER_QUESTION_BATCH : 0,
              });
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
