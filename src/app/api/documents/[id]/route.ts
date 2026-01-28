/**
 * Document Detail API
 *
 * GET: Get document details
 * PUT: Update document
 * DELETE: Move to trash (soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { documents, documentVersions, companies, applications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  const doc = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .get();

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
    if (!access.valid || !access.document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const doc = access.document;

    // Get company if linked (include infoFetchedAt to check RAG data availability)
    let company = null;
    if (doc.companyId) {
      company = await db
        .select({
          id: companies.id,
          name: companies.name,
          infoFetchedAt: companies.infoFetchedAt,
        })
        .from(companies)
        .where(eq(companies.id, doc.companyId))
        .get();
    }

    // Get application if linked
    let application = null;
    if (doc.applicationId) {
      application = await db
        .select({ id: applications.id, name: applications.name })
        .from(applications)
        .where(eq(applications.id, doc.applicationId))
        .get();
    }

    return NextResponse.json({
      document: {
        ...doc,
        content: doc.content ? JSON.parse(doc.content) : null,
        company,
        application,
      },
    });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    if (!access.valid || !access.document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, content, status, companyId, applicationId, jobTypeId } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json(
          { error: "タイトルは必須です" },
          { status: 400 }
        );
      }
      updateData.title = title.trim();
    }

    if (content !== undefined) {
      // Save version before updating (if content changed significantly)
      const oldContent = access.document.content;
      if (oldContent && oldContent !== JSON.stringify(content)) {
        await db.insert(documentVersions).values({
          id: crypto.randomUUID(),
          documentId,
          content: oldContent,
          createdAt: new Date(),
        });

        // Keep only last 5 versions
        const versions = await db
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.documentId, documentId))
          .orderBy(documentVersions.createdAt);

        if (versions.length > 5) {
          const toDelete = versions.slice(0, versions.length - 5);
          for (const v of toDelete) {
            await db.delete(documentVersions).where(eq(documentVersions.id, v.id));
          }
        }
      }

      updateData.content = JSON.stringify(content);
    }

    if (status !== undefined) {
      const validStatuses = ["draft", "published", "deleted"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "無効なステータスです" },
          { status: 400 }
        );
      }
      updateData.status = status;
      if (status === "deleted") {
        updateData.deletedAt = new Date();
      }
    }

    if (companyId !== undefined) {
      updateData.companyId = companyId || null;
    }

    if (applicationId !== undefined) {
      updateData.applicationId = applicationId || null;
    }

    if (jobTypeId !== undefined) {
      updateData.jobTypeId = jobTypeId || null;
    }

    const updated = await db
      .update(documents)
      .set(updateData)
      .where(eq(documents.id, documentId))
      .returning();

    return NextResponse.json({
      document: {
        ...updated[0],
        content: updated[0].content ? JSON.parse(updated[0].content) : null,
      },
    });
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Soft delete - move to trash
    await db
      .update(documents)
      .set({
        status: "deleted",
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
