/**
 * Deadline API
 *
 * GET: Get a single deadline
 * PUT: Update a deadline
 * DELETE: Delete a deadline
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { deadlines, companies, tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

type DeadlineType =
  | "es_submission"
  | "web_test"
  | "aptitude_test"
  | "interview_1"
  | "interview_2"
  | "interview_3"
  | "interview_final"
  | "briefing"
  | "internship"
  | "offer_response"
  | "other";

const VALID_TYPES: DeadlineType[] = [
  "es_submission",
  "web_test",
  "aptitude_test",
  "interview_1",
  "interview_2",
  "interview_3",
  "interview_final",
  "briefing",
  "internship",
  "offer_response",
  "other",
];

interface UpdateDeadlineBody {
  type?: DeadlineType;
  title?: string;
  description?: string;
  memo?: string;
  dueDate?: string;
  sourceUrl?: string;
  isConfirmed?: boolean;
  completedAt?: string | null;
}

async function verifyDeadlineAccess(
  deadlineId: string,
  request: NextRequest
): Promise<{
  valid: boolean;
  error?: string;
  deadline?: typeof deadlines.$inferSelect;
}> {
  // Get the deadline first
  const deadline = await db
    .select()
    .from(deadlines)
    .where(eq(deadlines.id, deadlineId))
    .get();

  if (!deadline) {
    return { valid: false, error: "Deadline not found" };
  }

  // Try authenticated session first
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    // Check if the deadline's company belongs to user
    const company = await db
      .select()
      .from(companies)
      .where(
        and(eq(companies.id, deadline.companyId), eq(companies.userId, session.user.id))
      )
      .get();

    if (!company) {
      return { valid: false, error: "Deadline not found" };
    }
    return { valid: true, deadline };
  }

  // Try guest token
  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      const company = await db
        .select()
        .from(companies)
        .where(
          and(eq(companies.id, deadline.companyId), eq(companies.guestId, guest.id))
        )
        .get();

      if (!company) {
        return { valid: false, error: "Deadline not found" };
      }
      return { valid: true, deadline };
    }
  }

  return { valid: false, error: "Authentication required" };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deadlineId } = await params;

    const access = await verifyDeadlineAccess(deadlineId, request);
    if (!access.valid) {
      return NextResponse.json(
        { error: access.error },
        { status: access.error === "Authentication required" ? 401 : 404 }
      );
    }

    const d = access.deadline!;

    return NextResponse.json({
      id: d.id,
      companyId: d.companyId,
      type: d.type,
      title: d.title,
      description: d.description,
      memo: d.memo,
      dueDate: d.dueDate?.toISOString(),
      isConfirmed: d.isConfirmed,
      confidence: d.confidence,
      sourceUrl: d.sourceUrl,
      completedAt: d.completedAt?.toISOString() || null,
      createdAt: d.createdAt?.toISOString(),
      updatedAt: d.updatedAt?.toISOString(),
    });
  } catch (error) {
    console.error("Error getting deadline:", error);
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
    const { id: deadlineId } = await params;

    const access = await verifyDeadlineAccess(deadlineId, request);
    if (!access.valid) {
      return NextResponse.json(
        { error: access.error },
        { status: access.error === "Authentication required" ? 401 : 404 }
      );
    }

    const body: UpdateDeadlineBody = await request.json();

    // Validate type if provided
    if (body.type && !VALID_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: "Invalid deadline type" },
        { status: 400 }
      );
    }

    // Validate title if provided
    if (body.title !== undefined && !body.title.trim()) {
      return NextResponse.json(
        { error: "Title cannot be empty" },
        { status: 400 }
      );
    }

    // Validate dueDate if provided
    let dueDate: Date | undefined;
    if (body.dueDate) {
      dueDate = new Date(body.dueDate);
      if (isNaN(dueDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid due date format" },
          { status: 400 }
        );
      }

      // All-day deadline rule: if time is 00:00:00, set to 12:00 JST (03:00 UTC)
      if (dueDate.getUTCHours() === 0 && dueDate.getUTCMinutes() === 0 && dueDate.getUTCSeconds() === 0) {
        dueDate.setUTCHours(3, 0, 0, 0); // 12:00 JST = 03:00 UTC
      }
    }

    // Parse completedAt if provided
    let completedAt: Date | null | undefined;
    if (body.completedAt !== undefined) {
      if (body.completedAt === null) {
        completedAt = null;
      } else {
        completedAt = new Date(body.completedAt);
        if (isNaN(completedAt.getTime())) {
          return NextResponse.json(
            { error: "Invalid completedAt date format" },
            { status: 400 }
          );
        }
      }
    }

    const now = new Date();
    const currentDeadline = access.deadline!;

    // Handle submission-linked task completion
    let autoCompletedTaskIds: string[] = [];

    // If marking as completed (completedAt is being set)
    if (completedAt && !currentDeadline.completedAt) {
      // Find all open tasks linked to this deadline
      const openTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.deadlineId, deadlineId),
            eq(tasks.status, "open")
          )
        );

      if (openTasks.length > 0) {
        // Mark all open tasks as done
        const taskIds = openTasks.map(t => t.id);
        await db
          .update(tasks)
          .set({
            status: "done",
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(tasks.deadlineId, deadlineId),
              eq(tasks.status, "open")
            )
          );

        autoCompletedTaskIds = taskIds;
      }
    }
    // If unmarking as completed (completedAt is being unset)
    else if (completedAt === null && currentDeadline.completedAt) {
      // Parse the stored auto-completed task IDs
      const storedTaskIds = currentDeadline.autoCompletedTaskIds
        ? JSON.parse(currentDeadline.autoCompletedTaskIds)
        : [];

      if (storedTaskIds.length > 0) {
        // Revert only the tasks that were auto-completed
        await db
          .update(tasks)
          .set({
            status: "open",
            completedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(tasks.deadlineId, deadlineId),
              eq(tasks.status, "done")
            )
          );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (body.type) updateData.type = body.type;
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined)
      updateData.description = body.description?.trim() || null;
    if (body.memo !== undefined) updateData.memo = body.memo?.trim() || null;
    if (dueDate) updateData.dueDate = dueDate;
    if (body.sourceUrl !== undefined)
      updateData.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.isConfirmed !== undefined) updateData.isConfirmed = body.isConfirmed;

    // Auto-create standard tasks when deadline is approved (isConfirmed: false → true)
    if (body.isConfirmed === true && !currentDeadline.isConfirmed) {
      const standardTasks = [
        { title: "ES作成", type: "es" as const, sortOrder: 0 },
        { title: "提出物準備", type: "other" as const, sortOrder: 1 },
        { title: "提出", type: "other" as const, sortOrder: 2 },
      ];

      for (const task of standardTasks) {
        await db.insert(tasks).values({
          id: crypto.randomUUID(),
          companyId: currentDeadline.companyId,
          applicationId: currentDeadline.applicationId,
          deadlineId: deadlineId,
          title: task.title,
          type: task.type,
          status: "open",
          isAutoGenerated: true,
          sortOrder: task.sortOrder,
          dueDate: currentDeadline.dueDate,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (completedAt !== undefined) {
      updateData.completedAt = completedAt;
      // Update autoCompletedTaskIds when marking complete or clearing it when unmarking
      if (completedAt) {
        updateData.autoCompletedTaskIds = JSON.stringify(autoCompletedTaskIds);
      } else {
        updateData.autoCompletedTaskIds = null;
      }
    }

    const updated = await db
      .update(deadlines)
      .set(updateData)
      .where(eq(deadlines.id, deadlineId))
      .returning();

    const d = updated[0];

    return NextResponse.json({
      success: true,
      deadline: {
        id: d.id,
        companyId: d.companyId,
        type: d.type,
        title: d.title,
        description: d.description,
        memo: d.memo,
        dueDate: d.dueDate?.toISOString(),
        isConfirmed: d.isConfirmed,
        confidence: d.confidence,
        sourceUrl: d.sourceUrl,
        completedAt: d.completedAt?.toISOString() || null,
        createdAt: d.createdAt?.toISOString(),
        updatedAt: d.updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error updating deadline:", error);
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
    const { id: deadlineId } = await params;

    const access = await verifyDeadlineAccess(deadlineId, request);
    if (!access.valid) {
      return NextResponse.json(
        { error: access.error },
        { status: access.error === "Authentication required" ? 401 : 404 }
      );
    }

    await db.delete(deadlines).where(eq(deadlines.id, deadlineId));

    return NextResponse.json({
      success: true,
      message: "Deadline deleted",
    });
  } catch (error) {
    console.error("Error deleting deadline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
