/**
 * Task Detail API
 *
 * GET: Get task details
 * PUT: Update task
 * DELETE: Delete task
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
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

async function verifyTaskAccess(
  taskId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; task?: typeof tasks.$inferSelect }> {
  const task = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .get();

  if (!task) {
    return { valid: false };
  }

  if (userId && task.userId === userId) {
    return { valid: true, task };
  }
  if (guestId && task.guestId === guestId) {
    return { valid: true, task };
  }

  return { valid: false };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const access = await verifyTaskAccess(taskId, identity.userId, identity.guestId);
    if (!access.valid || !access.task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ task: access.task });
  } catch (error) {
    console.error("Error fetching task:", error);
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
    const { id: taskId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const access = await verifyTaskAccess(taskId, identity.userId, identity.guestId);
    if (!access.valid) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { title, description, type, status, dueDate, completedAt } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (type !== undefined) {
      const validTypes = ["es", "web_test", "self_analysis", "gakuchika", "video", "other"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "無効なタイプです" },
          { status: 400 }
        );
      }
      updateData.type = type;
    }
    if (status !== undefined) {
      if (!["open", "done"].includes(status)) {
        return NextResponse.json(
          { error: "無効なステータスです" },
          { status: 400 }
        );
      }
      updateData.status = status;
      // Auto-set completedAt
      if (status === "done" && !access.task?.completedAt) {
        updateData.completedAt = new Date();
      } else if (status === "open") {
        updateData.completedAt = null;
      }
    }
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }
    if (completedAt !== undefined) {
      updateData.completedAt = completedAt ? new Date(completedAt) : null;
    }

    const updated = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    return NextResponse.json({ task: updated[0] });
  } catch (error) {
    console.error("Error updating task:", error);
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
    const { id: taskId } = await params;

    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const access = await verifyTaskAccess(taskId, identity.userId, identity.guestId);
    if (!access.valid) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    await db.delete(tasks).where(eq(tasks.id, taskId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
