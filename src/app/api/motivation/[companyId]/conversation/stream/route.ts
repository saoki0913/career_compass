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
import {
  motivationConversations,
  companies,
  applications,
  jobTypes,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { consumeCredits, hasEnoughCredits } from "@/lib/credits";
import {
  fetchGakuchikaContext,
  fetchProfileContext,
} from "@/lib/ai/user-context";
import {
  getMotivationConversationByCondition as getConversationByCondition,
  mergeDraftReadyContext,
  resolveDraftReadyState,
  safeParseConversationContext as parseConversationContext,
  type LastQuestionMeta as BaseLastQuestionMeta,
  type MotivationConversationContext as BaseMotivationConversationContext,
} from "@/lib/motivation/conversation";
import { resolveMotivationRoleContext } from "@/lib/constants/es-review-role-catalog";
import { CONVERSATION_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

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
  sourceType: "conversation" | "gakuchika" | "profile" | "safe_fallback";
  intent: string;
  evidenceSourceIds?: string[];
  rationale?: string | null;
  isTentative?: boolean;
}

type LastQuestionMeta = BaseLastQuestionMeta;

type MotivationConversationContext = BaseMotivationConversationContext;

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

function safeParseConversationContext(json: string | null): MotivationConversationContext {
  return parseConversationContext(json);
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

function applyAnswerToConversationContext(
  context: MotivationConversationContext,
  answer: string,
): MotivationConversationContext {
  const next = { ...context };
  const trimmed = answer.trim();
  switch (context.questionStage) {
    case "industry_reason":
      next.industryReason = trimmed;
      break;
    case "company_reason":
      next.companyReason = trimmed;
      break;
    case "self_connection":
      next.selfConnection = trimmed;
      next.fitConnection = trimmed;
      break;
    case "desired_work":
      next.desiredWork = trimmed;
      break;
    case "value_contribution":
      next.valueContribution = trimmed;
      break;
    case "differentiation":
      next.differentiationReason = trimmed;
      break;
    default:
      break;
  }
  return next;
}

// Configuration
const QUESTIONS_PER_CREDIT = 5;
const CREDITS_PER_QUESTION_BATCH = 3;
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params;
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
        JSON.stringify({ error: "志望動機のAI支援はログインが必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

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
    const conversation = await getConversationByCondition(
      userId
        ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
        : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
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
    const applicationJobCandidates = await fetchApplicationJobCandidates(companyId, userId, guestId);
    const resolvedBeforeAnswer = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      safeParseConversationContext(conversation.conversationContext),
      applicationJobCandidates,
    );

    if (!isSetupComplete(resolvedBeforeAnswer.conversationContext, resolvedBeforeAnswer.requiresIndustrySelection)) {
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

    const conversationContext = applyAnswerToConversationContext(
      resolvedBeforeAnswer.conversationContext,
      answer.trim(),
    );
    const resolvedAfterAnswer = resolveMotivationInputs(
      { id: company.id, name: company.name, industry: company.industry },
      conversationContext,
      applicationJobCandidates,
    );

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
      aiResponse = await fetchFastApiInternal("/api/motivation/next-question/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        body: JSON.stringify({
          company_id: company.id,
          company_name: company.name,
          industry: resolvedAfterAnswer.company.industry,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          question_count: newQuestionCount,
          scores,
          gakuchika_context: gakuchikaContext.length > 0 ? gakuchikaContext : null,
          conversation_context: resolvedAfterAnswer.conversationContext,
          profile_context: profileContext,
          application_job_candidates: applicationJobCandidates.length > 0 ? applicationJobCandidates : null,
          company_role_candidates: resolvedAfterAnswer.companyRoleCandidates.length > 0 ? resolvedAfterAnswer.companyRoleCandidates : null,
          company_work_candidates: resolvedAfterAnswer.conversationContext.companyWorkCandidates.length > 0
            ? resolvedAfterAnswer.conversationContext.companyWorkCandidates
            : null,
          requires_industry_selection: resolvedAfterAnswer.requiresIndustrySelection,
          industry_options: resolvedAfterAnswer.industryOptions.length > 0 ? resolvedAfterAnswer.industryOptions : null,
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

    // Consume-and-re-emit: intercept SSE events, process complete event
    const fastApiBody = aiResponse.body;
    if (!fastApiBody) {
      logAiCreditCostSummary({
        feature: "motivation",
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

    const reader = fastApiBody.getReader();
    const decoder = new TextDecoder();
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
        feature: "motivation",
        requestId,
        status: args.status,
        creditsUsed: args.creditsUsed,
        telemetry: args.telemetry ?? latestTelemetry,
      });
    };

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
                const rawEvent = JSON.parse(jsonStr) as Record<string, unknown>;
                const { payload, telemetry } = splitInternalTelemetry(rawEvent);
                latestTelemetry = telemetry ?? latestTelemetry;
                event = payload;
              } catch {
                // Forward unparseable lines as-is
                controller.enqueue(encoder.encode(line + "\n\n"));
                continue;
              }

              if (event.type === "progress") {
                // Forward progress events immediately
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } else if (event.type === "complete") {
                // Process complete event: DB save + credit consumption
                const fastApiData = (event as {
                  data: {
                    question?: string;
                    draft_ready?: boolean;
                    evaluation?: { scores: MotivationScores; is_complete: boolean };
                    captured_context?: Partial<MotivationConversationContext>;
                    question_stage?: string;
                    suggestion_options?: SuggestionOption[];
                    evidence_summary?: string | null;
                    evidence_cards?: unknown[];
                    coaching_focus?: string | null;
                    risk_flags?: string[];
                    stage_status?: unknown;
                  };
                }).data;

                // Add AI question to messages
                const currentDraftReadyState = resolveDraftReadyState(
                  resolvedAfterAnswer.conversationContext,
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
                    ...resolvedAfterAnswer.conversationContext,
                    ...(fastApiData.captured_context || {}),
                    lastQuestionMeta: {
                      ...(((resolvedAfterAnswer.conversationContext.lastQuestionMeta || {}) as LastQuestionMeta)),
                      ...((((fastApiData.captured_context?.lastQuestionMeta as LastQuestionMeta | undefined) || {}))),
                      questionText: fastApiData.question || null,
                    },
                  },
                  isDraftReady,
                  currentDraftReadyState.unlockedAt ?? undefined,
                );

                // Update database
                const updatedRows = await db
                  .update(motivationConversations)
                  .set({
                    messages: JSON.stringify(messages),
                    questionCount: newQuestionCount,
                    status: isDraftReady ? "completed" : "in_progress",
                    motivationScores: newScores ? JSON.stringify(newScores) : null,
                    conversationContext: JSON.stringify(nextConversationContext),
                    selectedRole: nextConversationContext.selectedRole ?? null,
                    selectedRoleSource: nextConversationContext.selectedRoleSource ?? null,
                    desiredWork: nextConversationContext.desiredWork ?? null,
                    questionStage:
                      fastApiData.question_stage ??
                      nextConversationContext.questionStage,
                    lastSuggestionOptions: JSON.stringify(fastApiData.suggestion_options || []),
                    lastEvidenceCards: JSON.stringify(fastApiData.evidence_cards || []),
                    stageStatus: JSON.stringify(
                      fastApiData.stage_status || {
                        current: fastApiData.question_stage || resolvedAfterAnswer.conversationContext.questionStage,
                        completed: [],
                        pending: [],
                      }
                    ),
                    updatedAt: new Date(),
                  })
                  .where(and(eq(motivationConversations.id, conversation.id), eq(motivationConversations.updatedAt, conversation.updatedAt)))
                  .returning({ id: motivationConversations.id });

                if (updatedRows.length === 0) {
                  const conflictEvent = {
                    type: "error",
                    message: "別のタブまたは直前の操作で会話が更新されました。画面を再読み込みしてからやり直してください。",
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(conflictEvent)}\n\n`)
                  );
                  return;
                }

                if (shouldConsumeCredit) {
                  await consumeCredits(userId!, CREDITS_PER_QUESTION_BATCH, "motivation", companyId);
                }
                logSummaryOnce({
                  status: "success",
                  creditsUsed: shouldConsumeCredit ? CREDITS_PER_QUESTION_BATCH : 0,
                });

                // Re-emit complete event with enriched data for frontend
                const enrichedEvent = {
                  type: "complete",
                  data: {
                    messages,
                    nextQuestion: fastApiData.question || null,
                    suggestionOptions: (fastApiData.suggestion_options || []) as SuggestionOption[],
                    questionCount: newQuestionCount,
                    isDraftReady,
                    draftReadyJustUnlocked,
                    scores: newScores,
                    evidenceSummary: fastApiData.evidence_summary || null,
                    evidenceCards: fastApiData.evidence_cards || [],
                    coachingFocus: typeof fastApiData.coaching_focus === "string" ? fastApiData.coaching_focus : null,
                    riskFlags: Array.isArray(fastApiData.risk_flags) ? fastApiData.risk_flags : [],
                    questionStage: fastApiData.question_stage || resolvedAfterAnswer.conversationContext.questionStage,
                    stageStatus: fastApiData.stage_status || null,
                  },
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(enrichedEvent)}\n\n`)
                );
              } else if (event.type === "error") {
                // Forward error events (no credit consumed)
                logSummaryOnce({
                  status: "failed",
                  creditsUsed: 0,
                });
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } else {
                // Forward unknown events
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
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
    console.error("Error in motivation stream:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
