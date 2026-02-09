/**
 * Gakuchika ES Draft Generation API
 *
 * POST: Generate ES draft from completed gakuchika conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  gakuchikaContents,
  gakuchikaConversations,
  documents,
} from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import {
  reserveCredits,
  confirmReservation,
  cancelReservation,
} from "@/lib/credits";
import { randomUUID } from "crypto";

async function getIdentity(
  request: NextRequest
): Promise<{
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
      .filter(
        (m): m is { role: string; content: string } =>
          m &&
          typeof m === "object" &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  } catch {
    return [];
  }
}

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

interface FastAPIDraftResponse {
  draft: string;
  char_count: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gakuchikaId } = await params;
  const identity = await getIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { userId, guestId } = identity;

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

  // Get latest completed conversation
  const [conversation] = await db
    .select()
    .from(gakuchikaConversations)
    .where(
      and(
        eq(gakuchikaConversations.gakuchikaId, gakuchikaId),
        eq(gakuchikaConversations.status, "completed")
      )
    )
    .orderBy(desc(gakuchikaConversations.updatedAt))
    .limit(1);

  if (!conversation) {
    return NextResponse.json(
      { error: "完了済みの深掘りセッションが見つかりません" },
      { status: 404 }
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

  // Reserve credits (1 credit for draft generation for logged-in users)
  let reservationId: string | null = null;
  if (userId) {
    const reservation = await reserveCredits(
      userId,
      1,
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
    const response = await fetch(
      `${FASTAPI_URL}/api/gakuchika/generate-es-draft`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gakuchika_title: gakuchika.title,
          conversation_history: messages,
          structured_summary: structuredSummary,
          char_limit: charLimit,
        }),
      }
    );

    if (!response.ok) {
      if (reservationId) await cancelReservation(reservationId);
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.detail?.error || "ES生成に失敗しました" },
        { status: 503 }
      );
    }

    const data: FastAPIDraftResponse = await response.json();

    // Confirm credit reservation on success
    if (reservationId) {
      await confirmReservation(reservationId);
    }

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
      documentId: documentId,
    });
  } catch (error) {
    if (reservationId) await cancelReservation(reservationId);
    console.error("[Gakuchika Draft] Error:", error);
    return NextResponse.json(
      { error: "ES生成中にエラーが発生しました" },
      { status: 503 }
    );
  }
}
