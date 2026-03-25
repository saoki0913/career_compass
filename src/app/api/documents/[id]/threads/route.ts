/**
 * AI Threads API
 *
 * GET: Get all AI threads for a document
 * POST: Create a thread with one or more messages
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, aiThreads, aiMessages } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

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

    // Get all threads for this document
    const threads = await db
      .select({
        id: aiThreads.id,
        title: aiThreads.title,
        status: aiThreads.status,
        createdAt: aiThreads.createdAt,
      })
      .from(aiThreads)
      .where(eq(aiThreads.documentId, documentId))
      .orderBy(desc(aiThreads.createdAt));

    // Get message counts for each thread
    const threadsWithCounts = await Promise.all(
      threads.map(async (thread) => {
        const [messageCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(aiMessages)
          .where(eq(aiMessages.threadId, thread.id))
          .limit(1);

        return {
          ...thread,
          messageCount: messageCount?.count || 0,
          createdAt: thread.createdAt.toISOString(),
        };
      })
    );

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

    const identity = await getIdentity(request);
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

      for (let i = 0; i < parsed.data.messages.length; i++) {
        const m = parsed.data.messages[i]!;
        const createdAt = new Date(now.getTime() + i);
        await tx.insert(aiMessages).values({
          id: crypto.randomUUID(),
          threadId,
          role: m.role,
          content: m.content,
          metadata:
            m.metadata !== undefined ? JSON.stringify(m.metadata) : null,
          createdAt,
        });
      }
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
