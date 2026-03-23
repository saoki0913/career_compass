/**
 * AI Thread Detail API
 *
 * GET: Get a specific AI thread with all messages
 * PATCH: Update thread title or status (archive)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, aiThreads, aiMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

const patchBodySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  title: z.string().min(1).max(220).optional(),
});

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  try {
    const { id: documentId, threadId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const access = await verifyDocumentAccess(documentId, identity.userId, identity.guestId);
    if (!access.valid) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Get thread
    const [thread] = await db
      .select()
      .from(aiThreads)
      .where(eq(aiThreads.id, threadId))
      .limit(1);

    if (!thread || thread.documentId !== documentId) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get all messages for this thread
    const messages = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.threadId, threadId))
      .orderBy(aiMessages.createdAt);

    const threadWithMessages = {
      ...thread,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
        createdAt: msg.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({ thread: threadWithMessages });
  } catch (error) {
    console.error("Error fetching AI thread:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  try {
    const { id: documentId, threadId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AI_THREAD_PATCH_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "ai-thread-patch-auth",
      });
    }

    const access = await verifyDocumentAccess(documentId, identity.userId, identity.guestId);
    if (!access.valid) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "AI_THREAD_PATCH_DOCUMENT_NOT_FOUND",
        userMessage: "ドキュメントが見つかりません。",
        action: "一覧から開き直してください。",
        retryable: false,
        developerMessage: "Document not found or access denied",
        logContext: "ai-thread-patch-access",
      });
    }

    const [thread] = await db
      .select()
      .from(aiThreads)
      .where(eq(aiThreads.id, threadId))
      .limit(1);

    if (!thread || thread.documentId !== documentId) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "AI_THREAD_NOT_FOUND",
        userMessage: "スレッドが見つかりません。",
        action: "一覧を更新してからお試しください。",
        retryable: false,
        developerMessage: "Thread not found",
        logContext: "ai-thread-patch-thread",
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse(request, {
        status: 400,
        code: "AI_THREAD_PATCH_INVALID_JSON",
        userMessage: "リクエストの形式が正しくありません。",
        action: "もう一度お試しください。",
        retryable: false,
        developerMessage: "Invalid JSON body",
        logContext: "ai-thread-patch-json",
      });
    }

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "AI_THREAD_PATCH_VALIDATION",
        userMessage: "入力内容を確認して、もう一度お試しください。",
        action: "画面を更新してから続行してください。",
        retryable: false,
        developerMessage: parsed.error.message,
        logContext: "ai-thread-patch-validation",
      });
    }

    if (parsed.data.status === undefined && parsed.data.title === undefined) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "AI_THREAD_PATCH_EMPTY",
        userMessage: "更新する項目がありません。",
        action: "タイトルまたはステータスを指定してください。",
        retryable: false,
        developerMessage: "No fields to update",
        logContext: "ai-thread-patch-empty",
      });
    }

    const now = new Date();
    await db
      .update(aiThreads)
      .set({
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        updatedAt: now,
      })
      .where(eq(aiThreads.id, threadId));

    const [updated] = await db
      .select()
      .from(aiThreads)
      .where(eq(aiThreads.id, threadId))
      .limit(1);

    return NextResponse.json({
      thread: updated
        ? {
            ...updated,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error("Error patching AI thread:", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "AI_THREAD_PATCH_FAILED",
      userMessage: "スレッドを更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "ai-thread-patch",
    });
  }
}
