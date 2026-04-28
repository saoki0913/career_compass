import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { db } from "@/lib/db";
import { documents, gakuchikaContents, gakuchikaConversations } from "@/lib/db/schema";
import { getCsrfFailureReason } from "@/lib/csrf";
import {
  getIdentity,
  safeParseConversationState,
  serializeConversationState,
} from "@/app/api/gakuchika";

function notFound(request: NextRequest) {
  return createApiErrorResponse(request, {
    status: 404,
    code: "GAKUCHIKA_DRAFT_NOT_FOUND",
    userMessage: "削除対象のES下書きが見つかりません。",
    action: "ページを再読み込みして、もう一度お試しください。",
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfFailure = getCsrfFailureReason(request);
    if (csrfFailure) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "CSRF_VALIDATION_FAILED",
        userMessage: "安全確認に失敗しました。ページを再読み込みして、もう一度お試しください。",
        developerMessage: `CSRF validation failed: ${csrfFailure}`,
      });
    }

    const identity = await getIdentity(request);
    if (!identity?.userId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "GAKUCHIKA_DRAFT_DISCARD_AUTH_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }
    const userId = identity.userId;

    const { id: gakuchikaId } = await params;
    const body = await request.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const documentId = typeof body.documentId === "string" ? body.documentId : "";
    if (!sessionId || !documentId) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "GAKUCHIKA_DRAFT_DISCARD_INVALID_REQUEST",
        userMessage: "削除対象の指定が不足しています。",
        action: "ページを再読み込みして、もう一度お試しください。",
      });
    }

    const [gakuchika] = await db
      .select()
      .from(gakuchikaContents)
      .where(eq(gakuchikaContents.id, gakuchikaId))
      .limit(1);
    if (!gakuchika || gakuchika.userId !== userId) return notFound(request);

    const [conversation] = await db
      .select()
      .from(gakuchikaConversations)
      .where(and(
        eq(gakuchikaConversations.id, sessionId),
        eq(gakuchikaConversations.gakuchikaId, gakuchikaId),
      ))
      .limit(1);
    if (!conversation) return notFound(request);

    const conversationState = safeParseConversationState(conversation.starScores, conversation.status);
    if (conversationState.draftDocumentId !== documentId) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "GAKUCHIKA_DRAFT_DOCUMENT_MISMATCH",
        userMessage: "この会話で作成されたES下書きだけ削除できます。",
        action: "ページを再読み込みして、最新の状態を確認してください。",
      });
    }

    const [document] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    if (
      !document ||
      document.userId !== userId ||
      document.type !== "es" ||
      document.status !== "draft" ||
      document.title !== `${gakuchika.title} ガクチカ` ||
      (conversationState.draftText && !String(document.content ?? "").includes(conversationState.draftText))
    ) {
      return notFound(request);
    }

    const nextState = {
      ...conversationState,
      stage: "draft_ready" as const,
      draftText: null,
      draftDocumentId: null,
      summaryStale: true,
      deepdiveComplete: false,
      deepdiveStage: null,
      progressLabel: "ESを作成できます",
      answerHint: "深掘り後に、もう一度ES下書きを作成できます。",
      pausedQuestion: null,
    };

    await db.transaction(async (tx) => {
      const deletedDocuments = await tx
        .update(documents)
        .set({
          status: "deleted",
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(documents.id, documentId),
          eq(documents.userId, userId),
          eq(documents.type, "es"),
          eq(documents.status, "draft"),
        ))
        .returning({ id: documents.id });
      if (deletedDocuments.length !== 1) {
        throw new Error("Draft document state changed before discard");
      }

      await tx
        .update(gakuchikaConversations)
        .set({
          status: "in_progress",
          starScores: serializeConversationState(nextState),
          updatedAt: new Date(),
        })
        .where(eq(gakuchikaConversations.id, sessionId));
    });

    return NextResponse.json({
      success: true,
      conversationState: nextState,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "GAKUCHIKA_DRAFT_DISCARD_FAILED",
      userMessage: "ES下書きの削除に失敗しました。",
      action: "時間を置いて、もう一度お試しください。",
      error,
      logContext: "GakuchikaDraftDiscard.POST",
    });
  }
}
