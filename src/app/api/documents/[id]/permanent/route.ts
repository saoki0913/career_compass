/**
 * Document Permanent Delete API
 *
 * DELETE: Permanently delete a document (only if in trash for 30+ days or manual deletion)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "DOCUMENT_PERMANENT_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "document-permanent-auth",
      });
    }

    const access = await verifyDocumentAccess(documentId, identity.userId, identity.guestId);
    if (!access.valid || !access.document) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "DOCUMENT_PERMANENT_DELETE_NOT_FOUND",
        userMessage: "削除対象のドキュメントが見つかりませんでした。",
        action: "一覧に戻って、対象のドキュメントを選び直してください。",
        developerMessage: "Document not found",
        logContext: "document-permanent-not-found",
      });
    }

    // Check if document is in trash
    if (access.document.status !== "deleted") {
      return createApiErrorResponse(request, {
        status: 400,
        code: "DOCUMENT_PERMANENT_DELETE_INVALID_STATE",
        userMessage: "ゴミ箱に入っているドキュメントだけ完全削除できます。",
        action: "対象の状態を確認して、もう一度お試しください。",
        developerMessage: "Document must be in trash before permanent deletion",
        logContext: "document-permanent-validation",
      });
    }

    // Permanently delete document (hard delete)
    await db.delete(documents).where(eq(documents.id, documentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "DOCUMENT_PERMANENT_DELETE_FAILED",
      userMessage: "ドキュメントを完全削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "document-permanent-delete",
    });
  }
}
