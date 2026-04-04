/**
 * Document AI Review SSE Stream API
 *
 * POST: Request AI review with real-time progress streaming
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, companies, userProfiles } from "@/lib/db/schema";
import {
  extractOtherDocumentSections,
  fetchGakuchikaContext,
  fetchProfileContext,
} from "@/lib/ai/user-context";
import type {
  DocumentSectionContext,
  GakuchikaContextItem,
  ProfileContext,
} from "@/lib/ai/user-context";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { reserveCredits, confirmReservation, cancelReservation, calculateESReviewCost } from "@/lib/credits";
import { enforceRateLimitLayers, REVIEW_RATE_LAYERS } from "@/lib/rate-limit-spike";
import type { TemplateType } from "@/hooks/useESReview";
import { FREE_PLAN_ES_REVIEW_MODEL, isStandardESReviewModel } from "@/lib/ai/es-review-models";
import { resolveEffectiveTemplateTypeWithoutCompany } from "@/lib/es-review/companyless-templates";
import { inferTemplateTypeDetailsFromQuestion } from "@/lib/es-review/infer-template-type";
import { resolveIndustryForReview } from "@/lib/constants/es-review-role-catalog";
import {
  parseCorporateInfoSources,
} from "@/lib/company-info/sources";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
  type InternalCostTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

function deriveCharMin(charLimit?: number | null) {
  if (!charLimit) {
    return null;
  }
  return Math.max(0, charLimit - 10);
}

type RoleSource = "user_input" | "none";

interface RoleContext {
  primary_role?: string;
  role_candidates: string[];
  source: RoleSource;
}

interface CorporateInfoUrlEntry {
  url: string;
  contentType?: string;
  fetchedAt?: string;
  kind?: "url" | "upload_pdf";
  sourceOrigin?: "manual_user";
  secondaryContentTypes?: string[];
  sourceType?: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relationCompanyName?: string | null;
  parentAllowed?: boolean;
  trustedForEsReview?: boolean;
  complianceStatus?: "allowed" | "warning" | "blocked";
}

function normalizeRoleLabel(value?: string | null): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function inferTemplateTypeWithCompany(question: string): TemplateType {
  const inferred = inferTemplateTypeDetailsFromQuestion(question);
  if (inferred.confidence !== "high") {
    return "basic";
  }
  return inferred.templateType as TemplateType;
}

const RETRIEVAL_QUERY_MAX_LENGTH = 850;

function buildRetrievalQuery(input: {
  templateType: TemplateType;
  industry?: string | null;
  sectionTitle: string;
  sectionContent: string;
  companyName?: string | null;
  roleName?: string | null;
  internName?: string | null;
  profileContext: ProfileContext | null;
  gakuchikaContext: GakuchikaContextItem[];
  otherSections: DocumentSectionContext[];
}) {
  const parts: string[] = [];
  const push = (value: string) => {
    const next = value.replace(/\s+/g, " ").trim();
    if (next) {
      parts.push(next);
    }
  };

  push(`設問タイプ:${input.templateType}`);
  if (input.industry) {
    push(`業界:${input.industry}`);
  }
  push(input.companyName ?? "");
  push(input.roleName ?? "");
  push(input.internName ?? "");
  push(input.sectionTitle);
  const summary = input.sectionContent.replace(/\s+/g, " ").trim().slice(0, 140);
  push(summary);

  if (input.profileContext) {
    const p = input.profileContext;
    const bits = [
      p.university,
      p.faculty,
      p.graduation_year != null ? `${p.graduation_year}年卒` : null,
      p.target_industries?.length ? `志望業界:${p.target_industries.slice(0, 4).join("・")}` : null,
      p.target_job_types?.length ? `志望職種:${p.target_job_types.slice(0, 4).join("・")}` : null,
    ].filter(Boolean);
    if (bits.length) {
      push(`プロフィール:${bits.join(" ")}`);
    }
  }

  for (const g of input.gakuchikaContext.slice(0, 4)) {
    const title = g.title?.trim();
    if (!title) {
      continue;
    }
    let excerpt = "";
    if (g.source_status === "structured_summary") {
      excerpt = [g.action_text, g.result_text].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 100);
    } else if (g.content_excerpt) {
      excerpt = g.content_excerpt.replace(/\s+/g, " ").trim().slice(0, 100);
    }
    push(`ガクチカ:「${title}」${excerpt}`);
  }

  for (const sec of input.otherSections.slice(0, 4)) {
    const t = sec.title?.trim();
    if (!t) {
      continue;
    }
    const c = sec.content.replace(/\s+/g, " ").trim().slice(0, 80);
    push(`他設問:「${t}」${c}`);
  }

  let joined = parts.join(" / ");
  if (joined.length > RETRIEVAL_QUERY_MAX_LENGTH) {
    joined = joined.slice(0, RETRIEVAL_QUERY_MAX_LENGTH);
  }
  return joined;
}

function parseCorporateInfoUrls(raw: string | null): CorporateInfoUrlEntry[] {
  return parseCorporateInfoSources(raw) as CorporateInfoUrlEntry[];
}

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

async function verifyDocumentAccess(
  documentId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; document?: typeof documents.$inferSelect }> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) {
    return { valid: false };
  }

  if (userId && doc.userId === userId) {
    return { valid: true, document: doc };
  }
  if (guestId && doc.guestId === guestId) {
    return { valid: true, document: doc };
  }

  return { valid: false };
}

function resolveRoleContext(explicitRoleName?: string): RoleContext {
  const manualRole = normalizeRoleLabel(explicitRoleName);
  if (manualRole) {
    return {
      primary_role: manualRole,
      role_candidates: [manualRole],
      source: "user_input",
    };
  }

  return {
    primary_role: undefined,
    role_candidates: [],
    source: "none",
  };
}

function collectUserProvidedCorporateUrls(entries: CorporateInfoUrlEntry[]): string[] {
  const urls: string[] = [];
  for (const entry of entries) {
    if (!entry.url) {
      continue;
    }
    if (entry.complianceStatus === "blocked") {
      continue;
    }
    if (!urls.includes(entry.url)) {
      urls.push(entry.url);
    }
  }
  return urls;
}

export async function handleReviewStream(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  backendPath: string = "/api/es/review/stream",
) {
  const requestId = getRequestId(request);
  try {
    const { id: documentId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userId, guestId } = identity;

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...REVIEW_RATE_LAYERS],
      userId,
      guestId,
      "documents_review_stream"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const access = await verifyDocumentAccess(documentId, userId, guestId);
    if (!access.valid || !access.document) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json();
    const {
      content,
      sectionId,
      hasCompanyRag = false,
      companyId: requestCompanyId,
      sectionTitle,
      sectionCharLimit,
      templateType,
      internName,
      roleName,
      industryOverride,
      llmModel,
    } = body as {
      content: string;
      sectionId?: string;
      hasCompanyRag?: boolean;
      companyId?: string;
      sectionTitle?: string;
      sectionCharLimit?: number;
      templateType?: TemplateType;
      internName?: string;
      roleName?: string;
      industryOverride?: string;
      llmModel?: string;
    };
    let resolvedLLMModel = typeof llmModel === "string" && isStandardESReviewModel(llmModel) ? llmModel : null;

    let userPlan: "free" | "standard" | "pro" = "free";
    if (userId) {
      const [profile] = await db
        .select({ plan: userProfiles.plan })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      const p = profile?.plan;
      userPlan = p === "standard" || p === "pro" ? p : "free";
    }
    if (userPlan === "free") {
      resolvedLLMModel = FREE_PLAN_ES_REVIEW_MODEL;
    }

    // Verify requestCompanyId ownership to prevent IDOR
    let companyId = access.document.companyId;
    if (requestCompanyId && requestCompanyId !== access.document.companyId) {
      const [ownedCompany] = await db
        .select({ id: companies.id, userId: companies.userId, guestId: companies.guestId })
        .from(companies)
        .where(eq(companies.id, requestCompanyId))
        .limit(1);
      if (
        ownedCompany &&
        ((userId && ownedCompany.userId === userId) ||
         (guestId && ownedCompany.guestId === guestId))
      ) {
        companyId = requestCompanyId;
      }
      // else: silently fall back to document's companyId (safe default)
    } else if (requestCompanyId) {
      companyId = requestCompanyId;
    }

    // Fetch company info so prompt construction can use company-aware quality guidance.
    let companyInfo: {
      name: string | null;
      industry: string | null;
      corporateInfoUrls: CorporateInfoUrlEntry[];
    } = {
      name: null,
      industry: null,
      corporateInfoUrls: [],
    };
    if (companyId) {
      const [company] = await db
        .select({
          name: companies.name,
          industry: companies.industry,
          corporateInfoUrls: companies.corporateInfoUrls,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (company) {
        companyInfo = {
          name: company.name,
          industry: company.industry,
          corporateInfoUrls: parseCorporateInfoUrls(company.corporateInfoUrls),
        };
      }
    }

    const inferredTemplateDetails = inferTemplateTypeDetailsFromQuestion(sectionTitle || "");
    let effectiveTemplateType: TemplateType;
    if (!companyId) {
      const resolved = resolveEffectiveTemplateTypeWithoutCompany(templateType, sectionTitle || "");
      if (!resolved.ok) {
        return new Response(
          JSON.stringify({
            error:
              "企業未選択の添削では、設問タイプは自動・ガクチカ・自己PR・価値観のいずれかにしてください",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      effectiveTemplateType = resolved.effective;
    } else {
      effectiveTemplateType = templateType ?? inferTemplateTypeWithCompany(sectionTitle || "");
    }
    const resolvedIndustry = resolveIndustryForReview({
      companyName: companyInfo.name,
      companyIndustry: companyInfo.industry,
      industryOverride,
    });
    const resolvedRoleContext = resolveRoleContext(roleName);
    const [profileContext, gakuchikaContext] = userId
      ? await Promise.all([
          fetchProfileContext(userId),
          fetchGakuchikaContext(userId, { allowIncomplete: true, limit: 4 }),
        ])
      : [null, []];
    const otherSections = extractOtherDocumentSections(
      access.document.content,
      sectionTitle || null,
      { maxSections: 4, maxCharsPerSection: 260 },
    );
    if (!content || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "内容が空です" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (companyId && !resolvedIndustry) {
      return new Response(
        JSON.stringify({ error: "企業に合わせた添削では、先に業界を選択してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (companyId && !resolvedRoleContext.primary_role) {
      return new Response(
        JSON.stringify({ error: "企業に合わせた添削では、先に職種を選択してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const retrievalQuery = buildRetrievalQuery({
      templateType: effectiveTemplateType,
      industry: resolvedIndustry,
      sectionTitle: sectionTitle || "",
      sectionContent: content,
      companyName: companyInfo.name,
      roleName: resolvedRoleContext.primary_role,
      internName: internName || null,
      profileContext,
      gakuchikaContext,
      otherSections,
    });

    // Calculate credit cost using the shared provider-aware pricing table.
    const charCount = content.length;
    const creditCost = calculateESReviewCost(charCount, resolvedLLMModel, { userPlan });

    // Reserve credits upfront (only for logged-in users)
    // Credits are deducted now and refunded if the stream fails.
    let reservationId: string | null = null;
    if (userId) {
      const reservation = await reserveCredits(userId, creditCost, "es_review", documentId, `ES添削: ${documentId}`);
      if (!reservation.success) {
        return new Response(
          JSON.stringify({ error: "クレジットが不足しています", creditCost }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      reservationId = reservation.reservationId;
    } else {
      // Guests can't use AI review - require login
      return new Response(
        JSON.stringify({ error: "AI添削機能を使用するにはログインが必要です" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userProvidedCorporateUrls = collectUserProvidedCorporateUrls(companyInfo.corporateInfoUrls);

    // Call FastAPI SSE streaming endpoint
    const aiResponse = await fetchFastApiInternal(backendPath, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({
        content,
        section_id: sectionId,
        has_company_rag: hasCompanyRag,
        company_id: companyId || null,
        section_title: sectionTitle || null,
        section_char_limit: sectionCharLimit || null,
        template_request: effectiveTemplateType
          ? {
              template_type: effectiveTemplateType,
              company_name: companyInfo.name,
              industry: resolvedIndustry,
              question: sectionTitle || "",
              answer: content,
              char_min: deriveCharMin(sectionCharLimit),
              char_max: sectionCharLimit || null,
              intern_name: internName || null,
              role_name: resolvedRoleContext.primary_role || null,
              inferred_template_type: inferredTemplateDetails.templateType,
              inferred_confidence: inferredTemplateDetails.confidence,
              secondary_template_types: inferredTemplateDetails.secondaryCandidates,
              classification_rationale: inferredTemplateDetails.rationale,
              recommended_grounding_level: inferredTemplateDetails.recommendedGroundingLevel,
            }
          : null,
        role_context: resolvedRoleContext,
        retrieval_query: retrievalQuery,
        profile_context: profileContext,
        gakuchika_context: gakuchikaContext,
        document_context: otherSections.length > 0 ? { other_sections: otherSections } : null,
        llm_model: resolvedLLMModel,
        // SSE specific: include document_id for credit consumption on completion
        document_id: documentId,
        user_id: userId,
        credit_cost: creditCost,
        user_provided_corporate_urls: userProvidedCorporateUrls,
      }),
    });

    if (!aiResponse.ok) {
      // FastAPI rejected the request — refund reserved credits
      if (reservationId) {
        await cancelReservation(reservationId).catch(console.error);
      }
      const rawErrorBody = await aiResponse.json().catch(() => null);
      const { payload: errorBody, telemetry } =
        rawErrorBody && typeof rawErrorBody === "object"
          ? splitInternalTelemetry(rawErrorBody as Record<string, unknown>)
          : { payload: rawErrorBody, telemetry: null as InternalCostTelemetry | null };
      logAiCreditCostSummary({
        feature: "es_review",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return new Response(
        JSON.stringify({
          error: (errorBody as { detail?: { error?: string } } | null)?.detail?.error || "AI review failed",
          error_type: (errorBody as { detail?: { error_type?: string } } | null)?.detail?.error_type,
        }),
        { status: aiResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Consume and re-emit individual SSE events so the browser receives
    // stable event boundaries even when upstream chunks are bursty.
    const fastApiBody = aiResponse.body;
    if (!fastApiBody) {
      if (reservationId) {
        await cancelReservation(reservationId).catch(console.error);
      }
      logAiCreditCostSummary({
        feature: "es_review",
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

    const capturedReservationId = reservationId;
    let creditConfirmed = false;
    let summaryLogged = false;
    const reader = fastApiBody.getReader();
    const decoder = new TextDecoder();
    const forwardedChunks: string[] = [];
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
        feature: "es_review",
        requestId,
        status: args.status,
        creditsUsed: args.creditsUsed,
        telemetry: args.telemetry ?? latestTelemetry,
      });
    };

    const confirmCreditsIfNeeded = async (eventType: unknown) => {
      if (eventType !== "complete" || creditConfirmed || !capturedReservationId) {
        return;
      }
      creditConfirmed = true;
      await confirmReservation(capturedReservationId).catch(console.error);
      logSummaryOnce({
        status: "success",
        creditsUsed: creditCost,
      });
    };

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let buffer = "";

        const forwardEventBlock = async (eventBlock: string) => {
          if (!eventBlock.trim()) {
            return;
          }

          forwardedChunks.push(eventBlock);

          const dataLine = eventBlock
            .split("\n")
            .find((line) => line.startsWith("data:"));

          if (dataLine) {
            const payload = dataLine.slice(5).trim();
            try {
              const rawEvent = JSON.parse(payload) as Record<string, unknown>;
              const { payload: sanitizedEvent, telemetry } = splitInternalTelemetry(rawEvent);
              latestTelemetry = telemetry ?? latestTelemetry;
              const event = sanitizedEvent as { type?: string };
              await confirmCreditsIfNeeded(event.type);
              if (event.type === "error") {
                logSummaryOnce({
                  status: "failed",
                  creditsUsed: 0,
                  telemetry,
                });
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(sanitizedEvent)}\n\n`));
              return;
            } catch {
              // Forward raw payload even if parsing fails; rescan later.
            }
          }

          controller.enqueue(encoder.encode(`${eventBlock}\n\n`));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const eventBlocks = buffer.split("\n\n");
            buffer = eventBlocks.pop() || "";

            for (const eventBlock of eventBlocks) {
              await forwardEventBlock(eventBlock);
            }
          }

          if (buffer.trim()) {
            await forwardEventBlock(buffer);
          }

          if (!creditConfirmed && capturedReservationId) {
            const fullStream = forwardedChunks.join("\n\n");
            if (/"type"\s*:\s*"complete"/.test(fullStream)) {
              creditConfirmed = true;
              await confirmReservation(capturedReservationId).catch(console.error);
              logSummaryOnce({
                status: "success",
                creditsUsed: creditCost,
              });
            }
          }

          controller.close();
        } catch (streamError) {
          console.error(`Error proxying ES review SSE stream (${backendPath}):`, streamError);
          const errorEvent = {
            type: "error",
            message: "AIストリーム接続が途中で切れました。しばらくしてから再試行してください。",
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`)
          );
          logSummaryOnce({
            status: "failed",
            creditsUsed: 0,
          });
          controller.close();
        } finally {
          if (!creditConfirmed && capturedReservationId) {
            await cancelReservation(capturedReservationId).catch(console.error);
          }
          if (!summaryLogged) {
            logSummaryOnce({
              status: "cancelled",
              creditsUsed: 0,
            });
          }
          reader.releaseLock();
        }
      },
      async cancel() {
        await reader.cancel().catch(() => undefined);
        if (!creditConfirmed && capturedReservationId) {
          await cancelReservation(capturedReservationId).catch(console.error);
        }
        logSummaryOnce({
          status: "cancelled",
          creditsUsed: 0,
        });
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
    console.error(`Error in review stream (${backendPath}):`, error);
    logAiCreditCostSummary({
      feature: "es_review",
      requestId,
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleReviewStream(request, { params }, "/api/es/review/stream");
}
