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
import { eq, desc } from "drizzle-orm";
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
import {
  getIdentity,
  isDraftReady,
  safeParseConversationState,
  safeParseMessages,
  serializeConversationState,
} from "@/app/api/gakuchika/shared";
import { fetchFastApiInternal } from "@/lib/fastapi/client";

interface FastAPIDraftResponse {
  draft: string;
  char_count: number;
  followup_suggestion?: string;
  internal_telemetry?: unknown;
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
  const { charLimit = 400 } = body;

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

  // Get latest conversation that belongs to this gakuchika
  const [conversation] = await db
    .select()
    .from(gakuchikaConversations)
    .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
    .orderBy(desc(gakuchikaConversations.updatedAt))
    .limit(1);

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

  // Parse structured summary if available
  let structuredSummary = null;
  if (gakuchika.summary) {
    try {
      const parsed = JSON.parse(gakuchika.summary);
      if (parsed.situation_text) {
        structuredSummary = parsed;
      }
    } catch {
      // Ignore parse errors
    }
  }

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

  // Call FastAPI for draft generation
  try {
    const response = await fetchFastApiInternal("/api/gakuchika/generate-es-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({
        gakuchika_title: gakuchika.title,
        conversation_history: messages,
        structured_summary: structuredSummary,
        char_limit: charLimit,
      }),
    });

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
      return NextResponse.json(
        { error: errorData.detail?.error || "ES生成に失敗しました" },
        { status: 503 }
      );
    }

    const rawData = await response.json();
    const { payload, telemetry } = splitInternalTelemetry(rawData);
    const data = payload as FastAPIDraftResponse;

    // Confirm credit reservation on success
    if (reservationId) {
      await confirmReservation(reservationId);
    }
    logAiCreditCostSummary({
      feature: "gakuchika_draft",
      requestId,
      status: "success",
      creditsUsed: reservationId ? 6 : 0,
      telemetry,
    });

    const updatedConversationState = {
      ...conversationState,
      stage: "draft_ready" as const,
      readyForDraft: true,
      progressLabel: "ES作成可",
      answerHint: "必要なら、この本文を起点に面接向けの深掘りを続けられます。",
      draftText: data.draft,
    };

    await db
      .update(gakuchikaConversations)
      .set({
        status: "completed",
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
        content: gakuchika.title,
        charLimit: charLimit,
      },
      {
        id: randomUUID(),
        type: "paragraph",
        content: data.draft,
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

    return NextResponse.json({
      draft: data.draft,
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
