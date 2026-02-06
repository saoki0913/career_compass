/**
 * Gakuchika Conversation SSE Stream API
 *
 * POST: Send answer and get next question via SSE streaming.
 * Proxies FastAPI SSE with "consume-and-re-emit" pattern:
 *   - progress events -> forwarded immediately
 *   - complete event -> DB save + credit consumption + summary if completed, then forwarded
 *   - error event -> forwarded (no credit consumed)
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";

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

interface STARScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

interface STAREvaluation {
  scores: STARScores;
  weakest_element: string;
  is_complete: boolean;
  missing_aspects?: Record<string, string[]>;
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

function safeParseStarScores(json: string | null): STARScores | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return {
      situation: parsed.situation ?? 0,
      task: parsed.task ?? 0,
      action: parsed.action ?? 0,
      result: parsed.result ?? 0,
    };
  } catch {
    return null;
  }
}

// Configuration (must match non-stream route)
const STAR_COMPLETION_THRESHOLD = 70;
const QUESTIONS_PER_CREDIT = 5;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

function isStarComplete(scores: STARScores | null): boolean {
  if (!scores) return false;
  return (
    scores.situation >= STAR_COMPLETION_THRESHOLD &&
    scores.task >= STAR_COMPLETION_THRESHOLD &&
    scores.action >= STAR_COMPLETION_THRESHOLD &&
    scores.result >= STAR_COMPLETION_THRESHOLD
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;
    const identity = await getIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    // Rate limiting check
    const rateLimitKey = createRateLimitKey("conversation", userId, guestId);
    const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.conversation);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "リクエストが多すぎます。しばらく待ってから再試行してください。" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    // Verify gakuchika access
    const gakuchika = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .get();

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
      conversation = await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .get();

      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return new Response(
          JSON.stringify({ error: "セッションが見つかりません" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      conversation = await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .get();
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
      const canPay = await hasEnoughCredits(userId!, 1);
      if (!canPay) {
        return new Response(
          JSON.stringify({ error: "クレジットが不足しています" }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Call FastAPI SSE streaming endpoint (with 60s timeout)
    const abortController = new AbortController();
    const fetchTimeoutId = setTimeout(() => abortController.abort(), 60_000);

    let aiResponse: Response;
    try {
      aiResponse = await fetch(`${FASTAPI_URL}/api/gakuchika/next-question/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        return new Response(
          JSON.stringify({ error: "AIの応答がタイムアウトしました。再度お試しください。" }),
          { status: 504, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AIサービスに接続できませんでした" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(fetchTimeoutId);
    }

    if (!aiResponse.ok) {
      const errorBody = await aiResponse.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: errorBody?.detail?.error || "AIサービスに接続できませんでした",
        }),
        { status: aiResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Consume-and-re-emit: intercept SSE events, process complete event
    const fastApiBody = aiResponse.body;
    if (!fastApiBody) {
      return new Response(
        JSON.stringify({ error: "AIレスポンスが空です" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const reader = fastApiBody.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              let event;
              try {
                event = JSON.parse(jsonStr);
              } catch {
                // Forward unparseable lines as-is
                controller.enqueue(encoder.encode(line + "\n\n"));
                continue;
              }

              if (event.type === "progress") {
                // Forward progress events immediately
                controller.enqueue(encoder.encode(line + "\n\n"));
              } else if (event.type === "complete") {
                // Process complete event: DB save + credit consumption
                const fastApiData = event.data;

                // Consume credit only after FastAPI success
                if (shouldConsumeCredit) {
                  await consumeCredits(userId!, 1, "gakuchika", gakuchikaId);
                }

                // Add AI question to messages
                let newStarScores = currentStarScores || { situation: 0, task: 0, action: 0, result: 0 };
                let starEvaluation: STAREvaluation | null = null;
                let targetElement: string | null = null;

                if (fastApiData.question) {
                  const aiMessage: Message = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: fastApiData.question,
                  };
                  messages.push(aiMessage);
                }

                if (fastApiData.star_evaluation) {
                  starEvaluation = fastApiData.star_evaluation;
                  newStarScores = fastApiData.star_evaluation.scores;
                  targetElement = fastApiData.star_evaluation.weakest_element || null;
                }

                // Check completion
                const starComplete = isStarComplete(newStarScores);
                const isCompleted = starComplete || (starEvaluation?.is_complete ?? false);
                const status = isCompleted ? "completed" : "in_progress";

                // Update conversation in database
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

                // Generate structured summary if completed
                let structuredSummary = null;
                if (isCompleted) {
                  try {
                    const summaryResponse = await fetch(`${FASTAPI_URL}/api/gakuchika/structured-summary`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
                        gakuchika_title: gakuchika.title,
                      }),
                    });

                    if (summaryResponse.ok) {
                      const summaryData = await summaryResponse.json();
                      const summaryJson = JSON.stringify({
                        situation_text: summaryData.situation_text || "",
                        task_text: summaryData.task_text || "",
                        action_text: summaryData.action_text || "",
                        result_text: summaryData.result_text || "",
                        strengths: summaryData.strengths || [],
                        learnings: summaryData.learnings || [],
                        numbers: summaryData.numbers || [],
                      });

                      await db
                        .update(gakuchikaContents)
                        .set({ summary: summaryJson, updatedAt: new Date() })
                        .where(eq(gakuchikaContents.id, gakuchikaId));

                      try {
                        structuredSummary = JSON.parse(summaryJson);
                      } catch {
                        structuredSummary = null;
                      }
                    }
                  } catch (summaryError) {
                    console.error("[Gakuchika Stream] Structured summary generation failed:", summaryError);
                    // Fallback: try old summary endpoint
                    try {
                      const fallbackRes = await fetch(`${FASTAPI_URL}/api/gakuchika/summary`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          conversation_history: messages.map(m => ({ role: m.role, content: m.content })),
                          gakuchika_title: gakuchika.title,
                        }),
                      });
                      if (fallbackRes.ok) {
                        const fbData = await fallbackRes.json();
                        const fbJson = JSON.stringify({
                          summary: fbData.summary || "",
                          key_points: fbData.key_points || [],
                          numbers: fbData.numbers || [],
                          strengths: fbData.strengths || [],
                        });
                        await db
                          .update(gakuchikaContents)
                          .set({ summary: fbJson, updatedAt: new Date() })
                          .where(eq(gakuchikaContents.id, gakuchikaId));
                        structuredSummary = JSON.parse(fbJson);
                      }
                    } catch {
                      // Final fallback: plain text
                      const userAnswers = messages
                        .filter(m => m.role === "user")
                        .map(m => m.content)
                        .join("\n\n");
                      const fallbackSummary = userAnswers.substring(0, 500) + (userAnswers.length > 500 ? "..." : "");
                      await db
                        .update(gakuchikaContents)
                        .set({ summary: fallbackSummary, updatedAt: new Date() })
                        .where(eq(gakuchikaContents.id, gakuchikaId));
                    }
                  }
                }

                // Re-emit complete event with enriched data for frontend
                const enrichedEvent = {
                  type: "complete",
                  data: {
                    messages,
                    nextQuestion: isCompleted ? null : fastApiData.question,
                    questionCount: newQuestionCount,
                    isCompleted,
                    starScores: newStarScores,
                    starEvaluation,
                    targetElement,
                    isAIPowered: true,
                    ...(structuredSummary && { summary: structuredSummary }),
                  },
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(enrichedEvent)}\n\n`)
                );
              } else if (event.type === "error") {
                // Forward error events (no credit consumed)
                controller.enqueue(encoder.encode(line + "\n\n"));
              } else {
                // Forward unknown events
                controller.enqueue(encoder.encode(line + "\n\n"));
              }
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
        } finally {
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
