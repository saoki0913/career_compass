/**
 * Document Restore API
 *
 * POST: Restore a trashed document
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

async function verifyDocumentAccess(
  documentId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; document?: typeof documents.$inferSelect }> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!doc) {
    return { valid: false };
  }

  if (userId && doc.userId === userId) {
    return { valid: true, document: doc };
  }
  if (guestId && doc.guestId === guestId) {
    return { valid: true, document: doc };
  }

  return { valid: false };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENT_RESTORE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "document-restore-auth",
      });
    }

    const access = await verifyDocumentAccess(documentId, identity.userId, identity.guestId);
    if (!access.valid || !access.document) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DOCUMENT_RESTORE_NOT_FOUND",
        userMessage: "復元対象のドキュメントが見つかりませんでした。",
        action: "一覧に戻って、対象のドキュメントを選び直してください。",
        developerMessage: "Document not found",
        logContext: "document-restore-not-found",
      });
    }

    // Check if document is actually deleted
    if (access.document.status !== "deleted") {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DOCUMENT_RESTORE_INVALID_STATE",
        userMessage: "ゴミ箱に入っているドキュメントだけ復元できます。",
        action: "対象の状態を確認して、もう一度お試しください。",
        developerMessage: "Document is not in trash",
        logContext: "document-restore-validation",
      });
    }

    // Restore document
    await db
      .update(documents)
      .set({
        status: "draft",
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENT_RESTORE_FAILED",
      userMessage: "ドキュメントを復元できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "document-restore",
    });
  }
}
