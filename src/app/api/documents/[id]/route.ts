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

type DocumentRow = typeof documents.$inferSelect;

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

async function buildDocumentResponse(doc: DocumentRow) {
  const [company, application] = await Promise.all([
    doc.companyId
      ? db
          .select({
            id: companies.id,
            name: companies.name,
            infoFetchedAt: companies.infoFetchedAt,
            corporateInfoFetchedAt: companies.corporateInfoFetchedAt,
          })
          .from(companies)
          .where(eq(companies.id, doc.companyId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    doc.applicationId
      ? db
          .select({ id: applications.id, name: applications.name })
          .from(applications)
          .where(eq(applications.id, doc.applicationId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  return {
    ...doc,
    content: doc.content ? JSON.parse(doc.content) : null,
    company,
    application,
  };
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

    return NextResponse.json({
      document: await buildDocumentResponse(doc),
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
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        return NextResponse.json(
          { error: "タイトルは必須です" },
          { status: 400 }
        );
      }
      if (trimmedTitle.length > 200) {
        return NextResponse.json(
          { error: "タイトルは200文字以内で入力してください" },
          { status: 400 }
        );
      }
      updateData.title = trimmedTitle;
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
      document: await buildDocumentResponse(updated[0]),
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
