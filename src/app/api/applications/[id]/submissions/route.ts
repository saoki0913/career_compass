/**
 * Submission Items API
 *
 * GET: List submission items for an application
 * POST: Add a submission item
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { submissionItems, applications } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
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

async function verifyApplicationAccess(
  applicationId: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const application = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .get();

  if (!application) return false;
  if (userId && application.userId === userId) return true;
  if (guestId && application.guestId === guestId) return true;
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const hasAccess = await verifyApplicationAccess(
      applicationId,
      identity.userId,
      identity.guestId
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const items = await db
      .select()
      .from(submissionItems)
      .where(eq(submissionItems.applicationId, applicationId))
      .orderBy(submissionItems.isRequired, desc(submissionItems.createdAt));

    return NextResponse.json({ submissions: items });
  } catch (error) {
    console.error("Error fetching submissions:", error);
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
    const { id: applicationId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const hasAccess = await verifyApplicationAccess(applicationId, userId, guestId);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { type, name, isRequired, notes } = body;

    if (!type || !name?.trim()) {
      return NextResponse.json(
        { error: "種類と名前は必須です" },
        { status: 400 }
      );
    }

    const validTypes = ["resume", "es", "photo", "transcript", "certificate", "portfolio", "other"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "無効な種類です" },
        { status: 400 }
      );
    }

    const now = new Date();
    const newItem = await db
      .insert(submissionItems)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        applicationId,
        type,
        name: name.trim(),
        isRequired: isRequired || false,
        status: "not_started",
        notes: notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ submission: newItem[0] });
  } catch (error) {
    console.error("Error creating submission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
