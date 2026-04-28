/**
 * Motivation ES draft without prior conversation (RAG + profile + gakuchika only).
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { motivationConversations } from "@/lib/db/schema";
import { reserveCredits, confirmReservation, cancelReservation } from "@/lib/credits";
import {
  DEFAULT_CONFIRMED_FACTS,
  DEFAULT_MOTIVATION_CONTEXT,
  mergeDraftReadyContext,
  safeParseConversationContext,
  type StageStatus,
  type MotivationConversationContext,
} from "@/lib/motivation/conversation";
import { buildMotivationUserEvidenceCards } from "@/lib/motivation/conversation-payload";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiWithPrincipal } from "@/lib/fastapi/client";
import { getViewerPlan } from "@/lib/server/loader-helpers";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import {
  fetchGakuchikaContext,
  fetchProfileContext,
  type GakuchikaContextItem,
  type ProfileContext,
} from "@/lib/ai/user-context";
import { normalizeEsDraftSingleParagraph } from "@/lib/server/es-draft-normalize";
import { messageFromFastApiDetail } from "@/lib/server/fastapi-detail-message";
import {
  ensureMotivationConversation,
  fetchMotivationApplicationJobCandidates,
  getOwnedMotivationCompanyData,
  resolveMotivationInputs,
  resolveMotivationRoleSelectionSource,
} from "@/lib/motivation/motivation-input-resolver";

interface FastAPIDraftResponse {
  draft: string;
  char_count: number;
  key_points: string[];
  company_keywords: string[];
  internal_telemetry?: unknown;
}

const PROFILE_ONLY_PENDING_SLOTS: MotivationConversationContext["questionStage"][] = [
  "company_reason",
  "self_connection",
  "desired_work",
  "value_contribution",
  "differentiation",
];

function hasDirectDraftMaterial(
  profileContext: ProfileContext | null,
  gakuchikaContext: GakuchikaContextItem[] | null,
): boolean {
  let signalCount = 0;

  if (profileContext) {
    if (profileContext.university || profileContext.faculty || profileContext.graduation_year) {
      signalCount += 1;
    }
    if (Array.isArray(profileContext.target_industries) && profileContext.target_industries.length > 0) {
      signalCount += 1;
    }
    if (Array.isArray(profileContext.target_job_types) && profileContext.target_job_types.length > 0) {
      signalCount += 1;
    }
  }

  if (Array.isArray(gakuchikaContext)) {
    const hasAnyGakuchika = gakuchikaContext.some((item) =>
      item.title || item.action_text || item.result_text || item.strengths || item.numbers
    );
    if (hasAnyGakuchika) {
      signalCount += 1;
    }
  }

  return signalCount >= 2;
}

function normalizeUserAnchorText(text: string | null | undefined, maxLength = 120): string | null {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function extractGakuchikaStrengths(items: GakuchikaContextItem[]): string[] {
  const strengths: string[] = [];
  for (const item of items) {
    for (const raw of item.strengths ?? []) {
      const value = typeof raw === "string" ? raw : raw.title || raw.description || "";
      const normalized = normalizeUserAnchorText(value, 48);
      if (normalized && !strengths.includes(normalized)) {
        strengths.push(normalized);
      }
      if (strengths.length >= 4) return strengths;
    }
  }
  return strengths;
}

function extractGakuchikaEpisodes(items: GakuchikaContextItem[]): string[] {
  const episodes: string[] = [];
  for (const item of items) {
    const candidates = [
      item.title,
      item.action_text,
      item.result_text,
      item.content_excerpt,
      ...(item.fact_spans ?? []),
    ];
    for (const candidate of candidates) {
      const normalized = normalizeUserAnchorText(candidate);
      if (normalized && !episodes.includes(normalized)) {
        episodes.push(normalized);
      }
      if (episodes.length >= 4) return episodes;
    }
  }
  return episodes;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const requestId = getRequestId(request);
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const { userId, guestId } = identity;
  if (!userId) {
    return NextResponse.json(
      { error: "志望動機のAI下書き生成はログインが必要です" },
      { status: 401 },
    );
  }

  const limitResponse = await guardDailyTokenLimit(identity);
  if (limitResponse) return limitResponse;

  const rateLimited = await enforceRateLimitLayers(
    request,
    [...DRAFT_RATE_LAYERS],
    userId,
    guestId,
    "motivation_generate_draft_direct",
  );
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => null);
  const charLimit = typeof body?.charLimit === "number" ? body.charLimit : 400;
  const selectedIndustry = typeof body?.selectedIndustry === "string" ? body.selectedIndustry.trim() : "";
  const selectedRole = typeof body?.selectedRole === "string" ? body.selectedRole.trim() : "";
  const roleSelectionSourceBody =
    typeof body?.roleSelectionSource === "string" ? body.roleSelectionSource.trim() : null;

  if (![300, 400, 500].includes(charLimit)) {
    return NextResponse.json({ error: "文字数は300, 400, 500のいずれかを指定してください" }, { status: 400 });
  }
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

  const existingMessages = Array.isArray(conversation.messages)
    ? conversation.messages
    : typeof conversation.messages === "string"
      ? JSON.parse(conversation.messages || "[]")
      : [];
  if (!Array.isArray(existingMessages) || existingMessages.length > 0) {
    return NextResponse.json(
      {
        error:
          "会話が始まっている場合は「会話せずに下書き」は使えません。志望動機ESを作成からお試しください。",
      },
      { status: 409 },
    );
  }

  const applicationJobCandidates = await fetchMotivationApplicationJobCandidates(companyId, userId, guestId);
  const resolvedInputs = resolveMotivationInputs(
    company,
    {
      ...safeParseConversationContext(conversation.conversationContext ?? null),
      selectedIndustry: selectedIndustry || undefined,
    },
    applicationJobCandidates,
  );
  const requiresIndustrySelection = resolvedInputs.requiresIndustrySelection;
  const effectiveIndustry =
    selectedIndustry || resolvedInputs.company.industry || company.industry || "";
  if (requiresIndustrySelection && !effectiveIndustry) {
    return NextResponse.json({ error: "先に業界を選択してください" }, { status: 400 });
  }

  const profileContext = await fetchProfileContext(userId);
  const gakuchikaContext = await fetchGakuchikaContext(userId);
  if (!hasDirectDraftMaterial(profileContext, gakuchikaContext)) {
    return NextResponse.json(
      {
        error:
          "プロフィールやガクチカの材料が不足しているため、会話なしの下書き生成はまだ使えません。志望業界・職種やガクチカを整えるか、対話ありで作成してください。",
      },
      { status: 409 },
    );
  }
  const selectedRoleSource = resolveMotivationRoleSelectionSource(
    selectedRole,
    profileContext,
    applicationJobCandidates,
    resolvedInputs.companyRoleCandidates,
    roleSelectionSourceBody,
  );

  let reservationId: string | null = null;
  const reservation = await reserveCredits(
    userId,
    6,
    "motivation_draft",
    companyId,
    `志望動機ES生成（会話なし）: ${company.name}`,
  );
  if (!reservation.success) {
    return NextResponse.json({ error: "クレジットが不足しています" }, { status: 402 });
  }
  reservationId = reservation.reservationId;

  try {
    const principalPlan = await getViewerPlan(identity);
    const actor = userId ? { kind: "user" as const, id: userId } : { kind: "guest" as const, id: guestId! };
    const response = await fetchFastApiWithPrincipal("/api/motivation/generate-draft-from-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      principal: {
        scope: "company",
        actor,
        companyId,
        plan: principalPlan,
      },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: effectiveIndustry || company.industry,
        selected_role: selectedRole,
        char_limit: charLimit,
        gakuchika_context: gakuchikaContext.length > 0 ? gakuchikaContext : null,
        profile_context: profileContext,
      }),
    });

    if (!response.ok) {
      if (reservationId) await cancelReservation(reservationId);
      const errorData = await response.json().catch(() => ({}));
      logAiCreditCostSummary({
        feature: "motivation_draft",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });

      if (response.status === 422) {
        return NextResponse.json(
          createApiErrorResponse(request, {
            status: 422,
            code: "VALIDATION_FAILED",
            userMessage: "入力データの検証に失敗しました。",
            action: "入力内容を見直して、もう一度お試しください。",
          }),
          { status: 422 }
        );
      }

      if (response.status === 409) {
        const detail = (errorData as { detail?: { error?: string; failure_codes?: string[] } }).detail;
        return NextResponse.json(
          createApiErrorResponse(request, {
            status: 409,
            code: "DRAFT_QUALITY_FAILED",
            userMessage: detail?.error || "志望動機の品質基準を満たす下書きを生成できませんでした。",
            action: "もう一度お試��ください。",
            retryable: true,
          }),
          { status: 409 }
        );
      }

      const msg =
        messageFromFastApiDetail((errorData as { detail?: unknown }).detail) || "ES生成に失敗しました";
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const rawData = await response.json();
    const { payload, telemetry } = splitInternalTelemetry(rawData);
    const data = payload as FastAPIDraftResponse;
    const draftNormalized = normalizeEsDraftSingleParagraph(data.draft);

    if (reservationId) await confirmReservation(reservationId);
    logAiCreditCostSummary({
      feature: "motivation_draft",
      requestId,
      status: "success",
      creditsUsed: reservationId ? 6 : 0,
      telemetry,
    });
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));

    const prevCtx = safeParseConversationContext(conversation.conversationContext ?? null);
    const industrySource: MotivationConversationContext["selectedIndustrySource"] =
      selectedIndustry
        ? "user_selected"
        : (resolvedInputs.conversationContext.selectedIndustrySource ?? prevCtx.selectedIndustrySource ?? "company_field");

    const baseCtx: MotivationConversationContext = {
      ...DEFAULT_MOTIVATION_CONTEXT,
      ...prevCtx,
      draftSource: "profile_only",
      userAnchorStrengths: extractGakuchikaStrengths(gakuchikaContext),
      userAnchorEpisodes: extractGakuchikaEpisodes(gakuchikaContext),
      profileAnchorIndustries: profileContext?.target_industries ?? [],
      profileAnchorJobTypes: profileContext?.target_job_types ?? [],
      selectedIndustry: effectiveIndustry || prevCtx.selectedIndustry,
      selectedIndustrySource: industrySource,
      selectedRole,
      selectedRoleSource,
      confirmedFacts: {
        ...DEFAULT_CONFIRMED_FACTS,
      },
      closedSlots: [],
      openSlots: [...DEFAULT_MOTIVATION_CONTEXT.openSlots],
      questionStage: "company_reason",
      conversationMode: "deepdive",
    };
    const mergedForFollowUp = mergeDraftReadyContext(baseCtx, true);
    const evidenceCards: [] = [];
    const stageStatus: StageStatus = {
      current: "company_reason",
      completed: [],
      pending: [...PROFILE_ONLY_PENDING_SLOTS],
    };
    const updatedMessages: { role: "user" | "assistant"; content: string }[] = [];

    const conversationContextPersisted = mergeDraftReadyContext(
      {
        ...mergedForFollowUp,
        conversationMode: "slot_fill",
        currentIntent: null,
        nextAdvanceCondition: null,
        causalGaps: [],
        questionStage: "company_reason",
        postDraftAwaitingResume: true,
        deepdiveResumeCount: 0,
        lastQuestionMeta: mergedForFollowUp.lastQuestionMeta || null,
      },
      true,
    );

    await db
      .update(motivationConversations)
      .set({
        generatedDraft: draftNormalized,
        charLimitType: String(charLimit) as "300" | "400" | "500",
        messages: updatedMessages,
        conversationContext: conversationContextPersisted,
        questionStage: "company_reason",
        lastEvidenceCards: evidenceCards,
        stageStatus,
        selectedRole,
        selectedRoleSource,
        updatedAt: new Date(),
      })
      .where(eq(motivationConversations.id, conversation.id));

    return NextResponse.json({
      draft: draftNormalized,
      charCount: data.char_count,
      keyPoints: data.key_points,
      companyKeywords: data.company_keywords,
      documentId: null,
      nextQuestion: null,
      evidenceSummary: null,
      evidenceCards,
      userEvidenceCards: buildMotivationUserEvidenceCards(conversationContextPersisted),
      coachingFocus: null,
      questionStage: "company_reason",
      conversationMode: "slot_fill",
      currentSlot: "company_reason",
      currentIntent: null,
      nextAdvanceCondition: null,
      progress: null,
      causalGaps: [],
      stageStatus,
      messages: updatedMessages,
    });
  } catch (error) {
    if (reservationId) await cancelReservation(reservationId);
    console.error("[Motivation Draft Direct] Error:", error);
    logAiCreditCostSummary({
      feature: "motivation_draft",
      requestId,
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return NextResponse.json({ error: "ES生成中にエラーが発生しました" }, { status: 503 });
  }
}
