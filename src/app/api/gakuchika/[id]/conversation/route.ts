/**
 * Gakuchika Conversation API
 *
 * GET: Get conversation history
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getGakuchikaNextAction,
  getIdentity,
  isInterviewReady,
  safeParseConversationState,
  safeParseMessages,
  verifyGakuchikaAccess,
  type Message,
} from "@/app/api/gakuchika";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!identity.userId) {
      return NextResponse.json(
        { error: "ガクチカのAI深掘りはログインが必要です" },
        { status: 401 },
      );
    }

    const hasAccess = await verifyGakuchikaAccess(gakuchikaId, identity.userId, identity.guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Gakuchika not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

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

    const sessions = allConversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      conversationState: safeParseConversationState(conversation.starScores, conversation.status),
      questionCount: conversation.questionCount || 0,
      createdAt: conversation.createdAt,
    }));

    let conversation;
    if (sessionId) {
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.id, sessionId))
        .limit(1))[0];

      if (!conversation || conversation.gakuchikaId !== gakuchikaId) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }
    } else {
      conversation = (await db
        .select()
        .from(gakuchikaConversations)
        .where(eq(gakuchikaConversations.gakuchikaId, gakuchikaId))
        .orderBy(desc(gakuchikaConversations.updatedAt))
        .limit(1))[0];
    }

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);

    if (!gakuchika) {
      return NextResponse.json(
        { error: "Gakuchika not found" },
        { status: 404 }
      );
    }

    if (!conversation) {
      return NextResponse.json({
        noConversation: true,
        gakuchikaTitle: gakuchika.title,
        gakuchikaContent: gakuchika.content,
        charLimitType: gakuchika.charLimitType,
        sessions: [],
      });
    }

    const messages: Message[] = safeParseMessages(conversation.messages);
    const questionCount = conversation.questionCount || 0;
    const conversationState = safeParseConversationState(conversation.starScores, conversation.status);
    const nextAction = getGakuchikaNextAction(conversationState);

    let nextQuestion: string | null = null;
    if (nextAction === "ask") {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === "assistant") {
        nextQuestion = lastMessage.content;
      }
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        questionCount,
        status: conversation.status,
      },
      messages,
      nextQuestion,
      questionCount,
      isCompleted: isInterviewReady(conversationState),
      conversationState,
      nextAction,
      isInterviewReady: isInterviewReady(conversationState),
      isAIPowered: true,
      gakuchikaContent: gakuchika.content,
      charLimitType: gakuchika.charLimitType,
      sessions,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
