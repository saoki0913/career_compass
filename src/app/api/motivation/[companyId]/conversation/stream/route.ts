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
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { motivationConversations, companies, gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";

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

interface GakuchikaContextItem {
  title: string;
  strengths: Array<{ title: string; description?: string } | string>;
  action_text?: string;
  result_text?: string;
  numbers?: string[];
}

async function fetchGakuchikaContext(userId: string): Promise<GakuchikaContextItem[]> {
  try {
    const contents = await db
      .select({
        id: gakuchikaContents.id,
        title: gakuchikaContents.title,
        summary: gakuchikaContents.summary,
      })
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.userId, userId))
      .orderBy(desc(gakuchikaContents.updatedAt));

    const results: GakuchikaContextItem[] = [];

    for (const content of contents) {
      if (results.length >= 3) break;

      const [latestConv] = await db
        .select({ status: gakuchikaConversations.status })
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, content.id))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1);

      if (latestConv?.status !== "completed") continue;
      if (!content.summary) continue;

      try {
        const parsed = JSON.parse(content.summary);
        if (typeof parsed !== "object") continue;

        results.push({
          title: content.title,
          strengths: parsed.strengths || [],
          action_text: parsed.action_text || "",
          result_text: parsed.result_text || "",
          numbers: parsed.numbers || [],
        });
      } catch {
        // Skip unparseable summaries
      }
    }

    return results;
  } catch (error) {
    console.error("[Motivation Stream] Failed to fetch gakuchika context:", error);
    return [];
  }
}

// Configuration (must match non-stream route)
const ELEMENT_COMPLETION_THRESHOLD = 70;
const QUESTIONS_PER_CREDIT = 5;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
    const identity = await getIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    const body = await request.json();
    const { answer } = body;

    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return new Response(
        JSON.stringify({ error: "回答を入力してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company) {
      return new Response(
        JSON.stringify({ error: "企業が見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get conversation
    const [conversation] = await db
      .select()
      .from(motivationConversations)
      .where(
        userId
          ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
          : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
      )
      .limit(1);

    if (!conversation) {
      return new Response(
        JSON.stringify({ error: "会話が見つかりません" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (conversation.status === "completed") {
      return new Response(
        JSON.stringify({ error: "この会話は既に完了しています" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const messages = safeParseMessages(conversation.messages);
    const currentQuestionCount = conversation.questionCount ?? 0;
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

    let aiResponse: Response;
    try {
      aiResponse = await fetch(`${FASTAPI_URL}/api/motivation/next-question/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: company.id,
          company_name: company.name,
          industry: company.industry,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          question_count: newQuestionCount,
          scores,
          gakuchika_context: gakuchikaContext.length > 0 ? gakuchikaContext : null,
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
                  await consumeCredits(userId!, 1, "motivation", companyId);
                }

                // Add AI question to messages
                let isCompleted = false;
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
                  isCompleted = fastApiData.evaluation.is_complete;
                }

                // Check completion
                if (newQuestionCount >= 8 && newScores) {
                  const allComplete =
                    newScores.company_understanding >= ELEMENT_COMPLETION_THRESHOLD &&
                    newScores.self_analysis >= ELEMENT_COMPLETION_THRESHOLD &&
                    newScores.career_vision >= ELEMENT_COMPLETION_THRESHOLD &&
                    newScores.differentiation >= ELEMENT_COMPLETION_THRESHOLD;
                  if (allComplete) {
                    isCompleted = true;
                  }
                }

                // Update database
                await db
                  .update(motivationConversations)
                  .set({
                    messages: JSON.stringify(messages),
                    questionCount: newQuestionCount,
                    status: isCompleted ? "completed" : "in_progress",
                    motivationScores: newScores ? JSON.stringify(newScores) : null,
                    lastSuggestions: JSON.stringify(fastApiData.suggestions || []),
                    updatedAt: new Date(),
                  })
                  .where(eq(motivationConversations.id, conversation.id));

                // Re-emit complete event with enriched data for frontend
                const enrichedEvent = {
                  type: "complete",
                  data: {
                    messages,
                    nextQuestion: isCompleted ? null : fastApiData.question,
                    suggestions: isCompleted ? [] : (fastApiData.suggestions || []),
                    questionCount: newQuestionCount,
                    isCompleted,
                    scores: newScores,
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
          console.error("[Motivation Stream] Error processing SSE:", err);
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
    console.error("Error in motivation stream:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
