/**
 * Gakuchika ES Draft Generation API
 *
 * POST: Generate ES draft once the conversation reaches draft-ready quality
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  gakuchikaContents,
  gakuchikaConversations,
  documents,
} from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import {
  reserveCredits,
  confirmReservation,
  cancelReservation,
} from "@/lib/credits";
import { randomUUID } from "crypto";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";
import { guardDailyTokenLimit } from "@/app/api/_shared/llm-cost-guard";
import { incrementDailyTokenCount, computeTotalTokens } from "@/lib/llm-cost-limit";
import {
  getIdentity,
  isDraftReady,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
  type DraftQualityChecks,
} from "@/app/api/gakuchika";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import { normalizeEsDraftSingleParagraph } from "@/lib/server/es-draft-normalize";
import { messageFromFastApiDetail } from "@/lib/server/fastapi-detail-message";
import { buildGakuchikaEsSectionTitle } from "@/lib/es-review/es-document-section-titles";

interface FastAPIDraftResponse {
  draft: string;
  char_count: number;
  followup_suggestion?: string;
  draft_diagnostics?: {
    strength_tags?: string[];
    issue_tags?: string[];
    deepdive_recommendation_tags?: string[];
    credibility_risk_tags?: string[];
  };
  internal_telemetry?: unknown;
}

type DraftMaterialPayload = {
  input_richness_mode: string | null;
  missing_elements: string[];
  draft_quality_checks: DraftQualityChecks;
  causal_gaps: string[];
  strength_tags: string[];
  issue_tags: string[];
  deepdive_recommendation_tags: string[];
  credibility_risk_tags: string[];
  deferred_focuses: string[];
  resolved_focuses: string[];
  draft_readiness_reason: string;
  user_fact_summary: string | null;
};

function buildKnownFacts(messages: Array<{ role: "user" | "assistant"; content: string }>): string | null {
  const answers = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean);
  if (answers.length === 0) return null;

  const selected: string[] = [];
  for (const answer of answers.slice(0, 2)) {
    if (!selected.includes(answer)) selected.push(answer);
  }
  for (const answer of answers.slice(2, -2)) {
    if (selected.length >= 4) break;
    if (!selected.includes(answer)) selected.push(answer);
  }
  for (const answer of answers.slice(-2)) {
    if (!selected.includes(answer)) selected.push(answer);
  }
  return selected.slice(0, 6).map((answer) => `- ${answer}`).join("\n");
}

function buildDraftMaterial(
  conversationState: ReturnType<typeof safeParseConversationState>,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): DraftMaterialPayload {
  return {
    input_richness_mode: conversationState.inputRichnessMode,
    missing_elements: conversationState.missingElements,
    draft_quality_checks: conversationState.draftQualityChecks,
    causal_gaps: conversationState.causalGaps,
    strength_tags: conversationState.strengthTags,
    issue_tags: conversationState.issueTags,
    deepdive_recommendation_tags: conversationState.deepdiveRecommendationTags,
    credibility_risk_tags: conversationState.credibilityRiskTags,
    deferred_focuses: conversationState.deferredFocuses,
    resolved_focuses: conversationState.resolvedFocuses,
    draft_readiness_reason: conversationState.draftReadinessReason,
    user_fact_summary: buildKnownFacts(messages),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gakuchikaId } = await params;
  const requestId = getRequestId(request);
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

  if (!userId) {
    return NextResponse.json(
      { error: "ガクチカのAI下書き生成はログインが必要です" },
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
    "gakuchika_generate_es_draft"
  );
  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json();
  const { charLimit = 400, sessionId } = body;

  if (![300, 400, 500].includes(charLimit)) {
    return NextResponse.json(
      { error: "文字数は300, 400, 500のいずれかを指定してください" },
      { status: 400 }
    );
  }

  // Get gakuchika
  const [gakuchika] = await db
    .select()
    .from(gakuchikaContents)
    .where(eq(gakuchikaContents.id, gakuchikaId))
    .limit(1);

  if (!gakuchika) {
    return NextResponse.json(
      { error: "ガクチカが見つかりません" },
      { status: 404 }
    );
  }

  // Verify access
  if (userId && gakuchika.userId !== userId) {
    return NextResponse.json(
      { error: "ガクチカが見つかりません" },
      { status: 404 }
    );
  }
  if (guestId && gakuchika.guestId !== guestId) {
    return NextResponse.json(
      { error: "ガクチカが見つかりません" },
      { status: 404 }
    );
  }

  // Get conversation: use specified session or fall back to latest
  const conversationQuery = typeof sessionId === "string" && sessionId
    ? db.select().from(gakuchikaConversations)
        .where(and(
          eq(gakuchikaConversations.id, sessionId),
          eq(gakuchikaConversations.gakuchikaId, gakuchikaId),
        )).limit(1)
    : db.select().from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1);
  const [conversation] = await conversationQuery;

  if (!conversation) {
    return NextResponse.json(
      { error: "ガクチカ作成セッションが見つかりません" },
      { status: 404 }
    );
  }

  const conversationState = safeParseConversationState(conversation.starScores, conversation.status);
  if (!isDraftReady(conversationState)) {
    return NextResponse.json(
      { error: "ES本文を書くための材料がまだ揃っていません" },
      { status: 409 }
    );
  }

  const messages = safeParseMessages(conversation.messages);
  if (messages.length < 2) {
    return NextResponse.json(
      { error: "会話が十分にありません" },
      { status: 400 }
    );
  }
  const knownFacts = buildKnownFacts(messages);
  const draftMaterial = buildDraftMaterial(conversationState, messages);

  // Reserve credits (6 credits for draft generation for logged-in users)
  let reservationId: string | null = null;
  if (userId) {
    const reservation = await reserveCredits(
      userId,
      6,
      "gakuchika_draft",
      gakuchikaId,
      `ガクチカES生成: ${gakuchika.title}`
    );
    if (!reservation.success) {
      return NextResponse.json(
        { error: "クレジットが不足しています" },
        { status: 402 }
      );
    }
    reservationId = reservation.reservationId;
  }

  // Call FastAPI for draft generation (retry transient 502/503 from upstream LLM/timeouts)
  try {
    let response = await fetchFastApiInternal("/api/gakuchika/generate-es-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({
        gakuchika_title: gakuchika.title,
        conversation_history: messages,
        char_limit: charLimit,
        known_facts: knownFacts,
        draft_material: draftMaterial,
      }),
    });

    const retryDelaysMs = [2500, 5000, 8000];
    for (let r = 0; r < retryDelaysMs.length; r++) {
      if (response.ok) break;
      if (response.status !== 502 && response.status !== 503) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[r]));
      response = await fetchFastApiInternal("/api/gakuchika/generate-es-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        body: JSON.stringify({
          gakuchika_title: gakuchika.title,
          conversation_history: messages,
          char_limit: charLimit,
          known_facts: knownFacts,
          draft_material: draftMaterial,
        }),
      });
    }

    if (!response.ok) {
      if (reservationId) await cancelReservation(reservationId);
      const errorData = await response.json().catch(() => ({}));
      logAiCreditCostSummary({
        feature: "gakuchika_draft",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry: null,
      });
      const detailMsg = messageFromFastApiDetail((errorData as { detail?: unknown }).detail);
      return NextResponse.json(
        { error: detailMsg || "ES生成に失敗しました" },
        { status: 503 }
      );
    }

    const rawData = await response.json();
    const { payload, telemetry } = splitInternalTelemetry(rawData);
    const data = payload as FastAPIDraftResponse;
    const draftNormalized = normalizeEsDraftSingleParagraph(data.draft);

    logAiCreditCostSummary({
      feature: "gakuchika_draft",
      requestId,
      status: "success",
      creditsUsed: reservationId ? 6 : 0,
      telemetry,
    });
    void incrementDailyTokenCount(identity, computeTotalTokens(telemetry));

    const updatedConversationState = {
      ...conversationState,
      stage: (["deep_dive_active", "interview_ready"].includes(conversationState.stage)
        ? conversationState.stage
        : "draft_ready") as typeof conversationState.stage,
      readyForDraft: true,
      progressLabel: "ESを作成できます",
      answerHint: "必要なら、この本文を起点に面接向けの深掘りを続けられます。",
      draftText: draftNormalized,
      deferredFocuses: Array.from(new Set([...conversationState.deferredFocuses, "learning"])) as typeof conversationState.deferredFocuses,
      strengthTags: data.draft_diagnostics?.strength_tags ?? conversationState.strengthTags,
      issueTags: data.draft_diagnostics?.issue_tags ?? conversationState.issueTags,
      deepdiveRecommendationTags:
        data.draft_diagnostics?.deepdive_recommendation_tags ?? conversationState.deepdiveRecommendationTags,
      credibilityRiskTags:
        data.draft_diagnostics?.credibility_risk_tags ?? conversationState.credibilityRiskTags,
    };

    await db
      .update(gakuchikaConversations)
      .set({
        status: "in_progress",
        starScores: serializeConversationState(updatedConversationState),
        updatedAt: new Date(),
      })
      .where(eq(gakuchikaConversations.id, conversation.id));

    // Create ES document with the generated draft
    const documentId = randomUUID();
    const documentBlocks = [
      {
        id: randomUUID(),
        type: "h2",
        content: buildGakuchikaEsSectionTitle(gakuchika.title),
        charLimit: charLimit,
      },
      {
        id: randomUUID(),
        type: "paragraph",
        content: draftNormalized,
      },
    ];

    await db.insert(documents).values({
      id: documentId,
      userId: userId || undefined,
      guestId: guestId || undefined,
      type: "es",
      title: `${gakuchika.title} ガクチカ`,
      content: JSON.stringify(documentBlocks),
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Confirm credit reservation only after all persistence succeeds
    if (reservationId) {
      await confirmReservation(reservationId);
    }

    return NextResponse.json({
      draft: draftNormalized,
      charCount: data.char_count,
      followupSuggestion: data.followup_suggestion ?? "更に深掘りする",
      documentId: documentId,
    });
  } catch (error) {
    if (reservationId) await cancelReservation(reservationId);
    console.error("[Gakuchika Draft] Error:", error);
    logAiCreditCostSummary({
      feature: "gakuchika_draft",
      requestId,
      status: "failed",
      creditsUsed: 0,
      telemetry: null,
    });
    return NextResponse.json(
      { error: "ES生成中にエラーが発生しました" },
      { status: 503 }
    );
  }
}
