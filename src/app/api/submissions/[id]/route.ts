/**
 * Submission Item Detail API
 *
 * PUT: Update submission item
 * DELETE: Delete submission item
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submissionItems } from "@/lib/db/schema";
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    const item = await db
      .select()
      .from(submissionItems)
      .where(eq(submissionItems.id, submissionId))
      .get();

    if (!item) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    const isOwner =
      (userId && item.userId === userId) ||
      (guestId && item.guestId === guestId);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type, name, isRequired, status, notes, fileUrl } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (type !== undefined) {
      const validTypes = ["resume", "es", "photo", "transcript", "certificate", "portfolio", "other"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "無効な種類です" },
          { status: 400 }
        );
      }
      updateData.type = type;
    }

    if (name !== undefined) updateData.name = name.trim();
    if (isRequired !== undefined) updateData.isRequired = isRequired;
    if (status !== undefined) {
      const validStatuses = ["not_started", "in_progress", "completed"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "無効なステータスです" },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (fileUrl !== undefined) updateData.fileUrl = fileUrl || null;

    const updated = await db
      .update(submissionItems)
      .set(updateData)
      .where(eq(submissionItems.id, submissionId))
      .returning();

    return NextResponse.json({ submission: updated[0] });
  } catch (error) {
    console.error("Error updating submission:", error);
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
    const { id: submissionId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;

    const item = await db
      .select()
      .from(submissionItems)
      .where(eq(submissionItems.id, submissionId))
      .get();

    if (!item) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    const isOwner =
      (userId && item.userId === userId) ||
      (guestId && item.guestId === guestId);

    if (!isOwner) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    await db.delete(submissionItems).where(eq(submissionItems.id, submissionId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting submission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
