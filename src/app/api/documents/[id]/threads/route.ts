/**
 * AI Threads API
 *
 * GET: Get all AI threads for a document
 * POST: Create a thread with one or more messages
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, aiThreads, aiMessages } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

const postBodySchema = z.object({
  title: z.string().min(1).max(220),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(500_000),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(30),
});

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    const identity = await getRequestIdentity(request);
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

    const threads = await db
      .select({
        id: aiThreads.id,
        title: aiThreads.title,
        status: aiThreads.status,
        createdAt: aiThreads.createdAt,
        messageCount: count(aiMessages.id),
      })
      .from(aiThreads)
      .leftJoin(aiMessages, eq(aiMessages.threadId, aiThreads.id))
      .where(eq(aiThreads.documentId, documentId))
      .groupBy(aiThreads.id, aiThreads.title, aiThreads.status, aiThreads.createdAt)
      .orderBy(desc(aiThreads.createdAt));

    const threadsWithCounts = threads.map((thread) => ({
      ...thread,
      messageCount: Number(thread.messageCount ?? 0),
      createdAt: thread.createdAt.toISOString(),
    }));

    return NextResponse.json({ threads: threadsWithCounts });
  } catch (error) {
    console.error("Error fetching AI threads:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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
        code: "AI_THREADS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "ai-threads-post-auth",
      });
    }

    const access = await verifyDocumentAccess(documentId, identity.userId, identity.guestId);
    if (!access.valid) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "AI_THREADS_DOCUMENT_NOT_FOUND",
        userMessage: "ドキュメントが見つかりません。",
        action: "一覧から開き直してください。",
        retryable: false,
        developerMessage: "Document not found or access denied",
        logContext: "ai-threads-post-access",
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse(request, {
        status: 400,
        code: "AI_THREADS_INVALID_JSON",
        userMessage: "リクエストの形式が正しくありません。",
        action: "もう一度お試しください。",
        retryable: false,
        developerMessage: "Invalid JSON body",
        logContext: "ai-threads-post-json",
      });
    }

    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "AI_THREADS_VALIDATION",
        userMessage: "入力内容を確認して、もう一度お試しください。",
        action: "画面を更新してから続行してください。",
        retryable: false,
        developerMessage: parsed.error.message,
        logContext: "ai-threads-post-validation",
      });
    }

    const threadId = crypto.randomUUID();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(aiThreads).values({
        id: threadId,
        documentId,
        title: parsed.data.title,
        status: "active",
        createdAt: now,
        updatedAt: now,
        gakuchikaId: null,
      });

      await tx.insert(aiMessages).values(
        parsed.data.messages.map((m, i) => ({
          id: crypto.randomUUID(),
          threadId,
          role: m.role,
          content: m.content,
          metadata: m.metadata !== undefined ? JSON.stringify(m.metadata) : null,
          createdAt: new Date(now.getTime() + i),
        }))
      );
    });

    return NextResponse.json(
      { threadId, message: "Thread created" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating AI thread:", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "AI_THREADS_CREATE_FAILED",
      userMessage: "スレッドを保存できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "ai-threads-post",
    });
  }
}
