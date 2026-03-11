import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  getIdentity,
  getQuestionFromFastAPI,
  getWeakestElement,
  safeParseMessages,
  safeParseStarScores,
  verifyGakuchikaAccess,
} from "@/app/api/gakuchika/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;
    const identity = await getIdentity(request);

    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const hasAccess = await verifyGakuchikaAccess(gakuchikaId, identity.userId, identity.guestId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Gakuchika not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);

    if (!gakuchika) {
      return NextResponse.json({ error: "Gakuchika not found" }, { status: 404 });
    }

    const conversation = (
      await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .limit(1)
    )[0];

    if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let messages = safeParseMessages(conversation.messages);
    const questionCount = conversation.questionCount || 0;
    const starScores = safeParseStarScores(conversation.starScores);
    let targetElement = getWeakestElement(starScores);
    let status = conversation.status;

    if (conversation.status === "completed") {
      const result = await getQuestionFromFastAPI(
        {
          title: gakuchika.title,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        messages,
        questionCount,
        starScores
      );

      if (result.error || !result.question) {
        return NextResponse.json(
          { error: result.error || "次の質問の生成に失敗しました" },
          { status: 503 }
        );
      }

      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.question,
        },
      ];
      targetElement = result.targetElement || targetElement;
      status = "in_progress";

      await db
        .update(gakuchikaConversations)
        .set({
          messages: JSON.stringify(messages),
          status,
          updatedAt: new Date(),
        })
        .where(eq(gakuchikaConversations.id, sessionId));
    }

    const allConversations = await db
      .select({
        id: gakuchikaConversations.id,
        status: gakuchikaConversations.status,
        starScores: gakuchikaConversations.starScores,
        questionCount: gakuchikaConversations.questionCount,
        createdAt: gakuchikaConversations.createdAt,
      })
      .from(gakuchikaConversations)
      .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
      .orderBy(desc(gakuchikaConversations.createdAt));

    const sessions = allConversations.map((item) => ({
      id: item.id,
      status: item.id === sessionId ? status : item.status,
      starScores: safeParseStarScores(item.starScores),
      questionCount: item.questionCount || 0,
      createdAt: item.createdAt,
    }));

    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");

    return NextResponse.json({
      conversation: {
        id: sessionId,
        questionCount,
        status,
      },
      messages,
      nextQuestion: lastAssistantMessage?.content || null,
      questionCount,
      isCompleted: false,
      starScores,
      targetElement,
      isAIPowered: true,
      gakuchikaContent: gakuchika.content,
      charLimitType: gakuchika.charLimitType,
      sessions,
    });
  } catch (error) {
    console.error("Error resuming conversation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
