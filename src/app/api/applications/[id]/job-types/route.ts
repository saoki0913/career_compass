/**
 * Job Types API
 *
 * GET: List job types for an application
 * POST: Create a new job type
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, jobTypes } from "@/lib/db/schema";
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

async function verifyApplicationAccess(
  applicationId: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const app = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .get();

  if (!app) return false;
  if (userId && app.userId === userId) return true;
  if (guestId && app.guestId === guestId) return true;
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

    const hasAccess = await verifyApplicationAccess(applicationId, identity.userId, identity.guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const jobTypeList = await db
      .select()
      .from(jobTypes)
      .where(eq(jobTypes.applicationId, applicationId))
      .orderBy(jobTypes.sortOrder);

    return NextResponse.json({ jobTypes: jobTypeList });
  } catch (error) {
    console.error("Error fetching job types:", error);
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

    const hasAccess = await verifyApplicationAccess(applicationId, identity.userId, identity.guestId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Check limit (max 5 per application)
    const existing = await db
      .select()
      .from(jobTypes)
      .where(eq(jobTypes.applicationId, applicationId));

    if (existing.length >= 5) {
      return NextResponse.json(
        { error: "1応募枠あたりの職種は最大5件までです" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "職種名は必須です" },
        { status: 400 }
      );
    }

    const newJobType = await db
      .insert(jobTypes)
      .values({
        id: crypto.randomUUID(),
        applicationId,
        name: name.trim(),
        sortOrder: existing.length,
        createdAt: new Date(),
      })
      .returning();

    return NextResponse.json({ jobType: newJobType[0] });
  } catch (error) {
    console.error("Error creating job type:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
