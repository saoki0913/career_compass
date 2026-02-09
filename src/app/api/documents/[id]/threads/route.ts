/**
 * AI Threads API
 *
 * GET: Get all AI threads for a document
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, aiThreads, aiMessages } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

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
