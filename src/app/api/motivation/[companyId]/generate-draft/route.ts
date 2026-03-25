/**
 * Motivation ES Draft Generation API
 *
 * POST: Generate ES draft from conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { motivationConversations, companies, documents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { reserveCredits, confirmReservation, cancelReservation } from "@/lib/credits";
import { randomUUID } from "crypto";
import {
  filterMotivationConversationUpdate,
  getMotivationConversationByCondition,
} from "@/lib/db/motivationConversationCompat";
import { DRAFT_RATE_LAYERS, enforceRateLimitLayers } from "@/lib/rate-limit-spike";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";

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
  role: "user" | "assistant";
  content: string;
}

function safeParseMessages(json: string): Message[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { role: string; content: string } =>
        m && typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
      )
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));
  } catch {
    return [];
  }
}

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIDraftResponse {
  draft: string;
  char_count: number;
  key_points: string[];
  company_keywords: string[];
  internal_telemetry?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  const requestId = getRequestId(request);
  const identity = await getIdentity(request);
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

  const rateLimited = await enforceRateLimitLayers(
    request,
    [...DRAFT_RATE_LAYERS],
    userId,
    guestId,
    "motivation_generate_draft"
  );
  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json();
  const { charLimit = 400 } = body;

  if (![300, 400, 500].includes(charLimit)) {
    return NextResponse.json({ error: "文字数は300, 400, 500のいずれかを指定してください" }, { status: 400 });
  }

  // Get company
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    return NextResponse.json({ error: "企業が見つかりません" }, { status: 404 });
  }

  // Get conversation
  const conversation = await getMotivationConversationByCondition(
    userId
      ? and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.userId, userId))
      : and(eq(motivationConversations.companyId, companyId), eq(motivationConversations.guestId, guestId!))
  );

  if (!conversation) {
    return NextResponse.json({ error: "会話が見つかりません" }, { status: 404 });
  }

  const messages = safeParseMessages(conversation.messages);
  if (messages.length < 2) {
    return NextResponse.json({ error: "会話が十分にありません" }, { status: 400 });
  }

  // Reserve credits upfront (6 credits for draft generation for logged-in users)
  let reservationId: string | null = null;
  if (userId) {
    const reservation = await reserveCredits(userId, 6, "motivation_draft", companyId, `志望動機ES生成: ${company.name}`);
    if (!reservation.success) {
      return NextResponse.json({ error: "クレジットが不足しています" }, { status: 402 });
    }
    reservationId = reservation.reservationId;
  }

  // Call FastAPI for draft generation
  try {
    const response = await fetch(`${FASTAPI_URL}/api/motivation/generate-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({
        company_id: company.id,
        company_name: company.name,
        industry: company.industry,
        conversation_history: messages,
        char_limit: charLimit,
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
      feature: "motivation_draft",
      requestId,
      status: "success",
      creditsUsed: reservationId ? 2 : 0,
      telemetry,
    });

    // Save draft to database
    await db
      .update(motivationConversations)
      .set(await filterMotivationConversationUpdate({
        generatedDraft: data.draft,
        charLimitType: String(charLimit) as "300" | "400" | "500",
        updatedAt: new Date(),
      }))
      .where(eq(motivationConversations.id, conversation.id));

    // Create ES document with the generated draft
    const documentId = randomUUID();
    const documentBlocks = [
      {
        id: randomUUID(),
        type: "h2",
        content: "志望動機",
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
      companyId: companyId,
      type: "es",
      title: `${company.name} 志望動機`,
      content: JSON.stringify(documentBlocks),
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      draft: data.draft,
      charCount: data.char_count,
      keyPoints: data.key_points,
      companyKeywords: data.company_keywords,
      documentId: documentId,
    });
  } catch (error) {
    if (reservationId) await cancelReservation(reservationId);
    console.error("[Motivation Draft] Error:", error);
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
