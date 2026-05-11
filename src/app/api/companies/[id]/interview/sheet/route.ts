import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { createApiErrorResponse } from "@/bff/api/error-response";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { db } from "@/lib/db";
import {
  companies,
  interviewConversations,
  interviewFeedbackHistories,
} from "@/lib/db/schema";
import type { InterviewFormat, InterviewRoundStage, InterviewSelectionType, InterviewStrictnessMode, InterviewerType } from "@/lib/interview/session";
import {
  createInterviewPersistenceUnavailableResponse,
  normalizeInterviewPersistenceError,
} from "@/lib/interview/persistence-errors";
import { saveInterviewFeedbackSheet } from "@/lib/interview/persistence";
import { validateInterviewMessages } from "@/lib/interview/read-model";
import { buildInterviewSheetMarkdown } from "@/lib/interview/sheet-builder";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getRequestIdentity(request);
  if (!identity?.userId && !identity?.guestId) {
    return createApiErrorResponse(request, {
      status: 401,
      code: "INTERVIEW_AUTH_REQUIRED",
      userMessage: "ログインが必要です。",
      action: "ログインしてから、もう一度お試しください。",
    });
  }

  const { id: companyId } = await params;
  let body: { conversationId?: string; historyId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const historyId = typeof body.historyId === "string" ? body.historyId.trim() : "";

  if (!conversationId || !historyId) {
    return createApiErrorResponse(request, {
      status: 400,
      code: "INTERVIEW_SHEET_INVALID",
      userMessage: "確認シートの生成に必要な情報が不足しています。",
      action: "ページを更新してから、もう一度お試しください。",
    });
  }

  const ownerConversationWhere = identity.userId
    ? and(
        eq(interviewConversations.id, conversationId),
        eq(interviewConversations.companyId, companyId),
        eq(interviewConversations.userId, identity.userId),
      )
    : and(
        eq(interviewConversations.id, conversationId),
        eq(interviewConversations.companyId, companyId),
        eq(interviewConversations.guestId, identity.guestId!),
      );

  const ownerHistoryWhere = identity.userId
    ? and(
        eq(interviewFeedbackHistories.id, historyId),
        eq(interviewFeedbackHistories.companyId, companyId),
        eq(interviewFeedbackHistories.conversationId, conversationId),
        eq(interviewFeedbackHistories.userId, identity.userId),
      )
    : and(
        eq(interviewFeedbackHistories.id, historyId),
        eq(interviewFeedbackHistories.companyId, companyId),
        eq(interviewFeedbackHistories.conversationId, conversationId),
        eq(interviewFeedbackHistories.guestId, identity.guestId!),
      );

  try {
    const [conversation] = await db
      .select()
      .from(interviewConversations)
      .where(ownerConversationWhere)
      .limit(1);

    if (!conversation) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "INTERVIEW_CONVERSATION_NOT_FOUND",
        userMessage: "対象の面接セッションが見つかりません。",
        action: "ページを更新してから、もう一度お試しください。",
      });
    }

    const [history] = await db
      .select()
      .from(interviewFeedbackHistories)
      .where(ownerHistoryWhere)
      .limit(1);

    if (!history) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "INTERVIEW_FEEDBACK_HISTORY_NOT_FOUND",
        userMessage: "対象の講評履歴が見つかりません。",
        action: "ページを更新してから、もう一度お試しください。",
      });
    }

    if (history.sheetContent) {
      return NextResponse.json({
        ok: true,
        sheetContent: history.sheetContent,
        feedbackHistoryId: history.id,
        alreadyExists: true,
      });
    }

    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    const validatedMessages = validateInterviewMessages(conversation.messages);
    const messages = validatedMessages ?? [];
    const scores = (history.scores ?? {}) as Record<string, number>;
    const strengths = Array.isArray(history.strengths) ? (history.strengths as string[]) : [];
    const improvements = Array.isArray(history.improvements) ? (history.improvements as string[]) : [];
    const consistencyRisks = Array.isArray(history.consistencyRisks) ? (history.consistencyRisks as string[]) : [];
    const nextPreparation = Array.isArray(history.preparationPoints) ? (history.preparationPoints as string[]) : [];

    const sheetContent = buildInterviewSheetMarkdown({
      companyName: company?.name ?? companyId,
      setup: {
        interviewFormat: (conversation.interviewFormat ?? "standard_behavioral") as InterviewFormat,
        selectionType: (conversation.selectionType ?? "fulltime") as InterviewSelectionType,
        interviewStage: (conversation.interviewStage ?? "early") as InterviewRoundStage,
        interviewerType: (conversation.interviewerType ?? "hr") as InterviewerType,
        strictnessMode: (conversation.strictnessMode ?? "standard") as InterviewStrictnessMode,
      },
      selectedRole: conversation.selectedRole ?? null,
      messages,
      feedback: {
        overall_comment: history.overallComment,
        scores,
        strengths,
        improvements,
        consistency_risks: consistencyRisks,
        weakest_question_type: history.weakestQuestionType ?? null,
        weakest_turn_id: history.weakestTurnId ?? null,
        weakest_question_snapshot: history.weakestQuestionSnapshot ?? null,
        weakest_answer_snapshot: history.weakestAnswerSnapshot ?? null,
        improved_answer: history.improvedAnswer,
        next_preparation: nextPreparation,
      },
      generatedAt: new Date(),
    });

    const updated = await saveInterviewFeedbackSheet({
      companyId,
      identity,
      historyId,
      sheetContent,
    });

    if (!updated) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "INTERVIEW_FEEDBACK_HISTORY_NOT_FOUND",
        userMessage: "確認シートの保存先が見つかりません。",
        action: "ページを更新してから、もう一度お試しください。",
      });
    }

    return NextResponse.json({
      ok: true,
      sheetContent,
      feedbackHistoryId: history.id,
    });
  } catch (error) {
    const persistenceError = normalizeInterviewPersistenceError(error, {
      companyId,
      operation: "interview:generate-sheet",
    });
    if (persistenceError) {
      return createInterviewPersistenceUnavailableResponse(request, persistenceError);
    }
    throw error;
  }
}
