/**
 * Application API
 *
 * GET: Get application details
 * PUT: Update application
 * DELETE: Delete application
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { applications, companies, deadlines, jobTypes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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
    return {
      userId: session.user.id,
      guestId: null,
    };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return {
        userId: null,
        guestId: guest.id,
      };
    }
  }

  return null;
}

async function verifyApplicationAccess(
  applicationId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; application?: typeof applications.$inferSelect }> {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) {
    return { valid: false };
  }

  // Verify ownership
  if (userId && app.userId === userId) {
    return { valid: true, application: app };
  }
  if (guestId && app.guestId === guestId) {
    return { valid: true, application: app };
  }

  return { valid: false };
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

    const { userId, guestId } = identity;
    const access = await verifyApplicationAccess(applicationId, userId, guestId);

    if (!access.valid || !access.application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, access.application.companyId))
      .limit(1);

    // Get job types
    const jobTypeList = await db
      .select()
      .from(jobTypes)
      .where(eq(jobTypes.applicationId, applicationId))
      .orderBy(jobTypes.sortOrder);

    // Get deadlines
    const deadlineList = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.applicationId, applicationId));

    return NextResponse.json({
      application: {
        ...access.application,
        phase: access.application.phase ? JSON.parse(access.application.phase) : [],
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            industry: company.industry,
          }
        : null,
      jobTypes: jobTypeList,
      deadlines: deadlineList,
    });
  } catch (error) {
    console.error("Error fetching application:", error);
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
    const { id: applicationId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const access = await verifyApplicationAccess(applicationId, userId, guestId);

    if (!access.valid) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, type, status, phase, sortOrder } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (type !== undefined) {
      const validTypes = ["summer_intern", "fall_intern", "winter_intern", "early", "main", "other"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "無効なタイプです" },
          { status: 400 }
        );
      }
      updateData.type = type;
    }
    if (status !== undefined) {
      const validStatuses = ["active", "completed", "withdrawn"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "無効なステータスです" },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (phase !== undefined) {
      updateData.phase = JSON.stringify(phase);
    }
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder;
    }

    const updated = await db
      .update(applications)
      .set(updateData)
      .where(eq(applications.id, applicationId))
      .returning();

    return NextResponse.json({
      application: {
        ...updated[0],
        phase: updated[0].phase ? JSON.parse(updated[0].phase) : [],
      },
    });
  } catch (error) {
    console.error("Error updating application:", error);
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
    const { id: applicationId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const access = await verifyApplicationAccess(applicationId, userId, guestId);

    if (!access.valid) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Delete application (cascades to job types, deadlines, etc.)
    await db.delete(applications).where(eq(applications.id, applicationId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting application:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
