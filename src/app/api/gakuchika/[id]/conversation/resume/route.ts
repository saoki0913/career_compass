import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  getGakuchikaNextAction,
  getIdentity,
  getQuestionFromFastAPI,
  isInterviewReady,
  safeParseMessages,
  safeParseConversationState,
  serializeConversationState,
  verifyGakuchikaAccess,
  type ConversationState,
} from "@/app/api/gakuchika";
import {
  getRequestId,
  logAiCreditCostSummary,
} from "@/lib/ai/cost-summary-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: gakuchikaId } = await params;
    const requestId = getRequestId(request);
    const identity = await getIdentity(request);

    if (!identity) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if (!identity.userId) {
      return NextResponse.json(
        { error: "ガクチカのAI深掘りはログインが必要です" },
        { status: 401 },
      );
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
    let conversationState = safeParseConversationState(conversation.starScores, conversation.status);
    let status = conversation.status;
    let nextAction = getGakuchikaNextAction(conversationState);

    const shouldFetchNextQuestion =
      conversationState.stage === "draft_ready" || conversationState.stage === "interview_ready";

    if (shouldFetchNextQuestion) {
      const stateForApi: ConversationState =
        conversationState.stage === "interview_ready"
          ? {
              ...conversationState,
              stage: "deep_dive_active",
              deepdiveComplete: false,
              deepdiveStage: "es_aftercare",
              progressLabel: "さらに深掘り中",
              extendedDeepDiveRound: (conversationState.extendedDeepDiveRound ?? 0) + 1,
            }
          : conversationState;

      const result = await getQuestionFromFastAPI(
        {
          title: gakuchika.title,
          content: gakuchika.content,
          charLimitType: gakuchika.charLimitType,
        },
        messages,
        questionCount,
        stateForApi,
        requestId,
      );

      const resolvedNextAction =
        result.nextAction ?? getGakuchikaNextAction(result.conversationState ?? stateForApi);
      if (result.error || (resolvedNextAction === "ask" && !result.question)) {
        logAiCreditCostSummary({
          feature: "gakuchika_resume",
          requestId,
          status: "failed",
          creditsUsed: 0,
          telemetry: result.telemetry,
        });
        return NextResponse.json(
          { error: result.error || "次の質問の生成に失敗しました" },
          { status: 503 }
        );
      }

      if (result.question) {
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.question,
          },
        ];
      }
      conversationState = result.conversationState
        ? {
            ...stateForApi,
            ...result.conversationState,
            extendedDeepDiveRound:
              result.conversationState.extendedDeepDiveRound ?? stateForApi.extendedDeepDiveRound,
          }
        : stateForApi;
      nextAction = resolvedNextAction;
      status = isInterviewReady(conversationState) ? "completed" : "in_progress";

      await db
        .update(gakuchikaConversations)
        .set({
          messages: JSON.stringify(messages),
          status,
          starScores: serializeConversationState(conversationState),
          updatedAt: new Date(),
        })
        .where(eq(gakuchikaConversations.id, sessionId));
      logAiCreditCostSummary({
        feature: "gakuchika_resume",
        requestId,
        status: "success",
        creditsUsed: 0,
        telemetry: result.telemetry,
      });
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
        conversationState:
          item.id === sessionId
            ? conversationState
            : safeParseConversationState(item.starScores, item.status),
        questionCount: item.questionCount || 0,
        createdAt: item.createdAt,
      }));

    const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
    nextAction = getGakuchikaNextAction(conversationState);

    return NextResponse.json({
      conversation: {
        id: sessionId,
        questionCount,
        status,
      },
      messages,
      nextQuestion: nextAction === "ask" ? lastAssistantMessage?.content || null : null,
      questionCount,
      isCompleted: isInterviewReady(conversationState),
      isInterviewReady: isInterviewReady(conversationState),
      conversationState,
      nextAction,
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
