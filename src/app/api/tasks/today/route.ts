/**
 * Today's Most Important Task API
 *
 * GET: Get the most important task for today based on recommendation logic
 *
 * Logic (SPEC Section 13.3-13.5):
 * - If any confirmed deadline within 72h: DEADLINE mode
 *   - score = open_tasks_count / max(1, hours_to_due)
 *   - Pick highest score application, then oldest open task
 * - Otherwise: DEEP_DIVE mode
 *   - Priority: ES_DRAFT → GAKUCHIKA → OTHER
 *   - Within same priority: older company, older task
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks, deadlines, applications, companies } from "@/lib/db/schema";
import { eq, and, lte, gte, isNull } from "drizzle-orm";
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

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const now = new Date();
    const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    // Get all open tasks for the user
    const openTasks = await db
      .select({
        task: tasks,
        company: companies,
        application: applications,
        deadline: deadlines,
      })
      .from(tasks)
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .leftJoin(applications, eq(tasks.applicationId, applications.id))
      .leftJoin(deadlines, eq(tasks.deadlineId, deadlines.id))
      .where(
        and(
          eq(tasks.status, "open"),
          userId
            ? eq(tasks.userId, userId)
            : guestId
            ? eq(tasks.guestId, guestId)
            : isNull(tasks.id)
        )
      );

    if (openTasks.length === 0) {
      return NextResponse.json({
        mode: null,
        task: null,
        message: "タスクがありません",
      });
    }

    // Check for confirmed deadlines within 72h
    const urgentDeadlines = await db
      .select()
      .from(deadlines)
      .innerJoin(companies, eq(deadlines.companyId, companies.id))
      .where(
        and(
          eq(deadlines.isConfirmed, true),
          isNull(deadlines.completedAt),
          lte(deadlines.dueDate, in72h),
          gte(deadlines.dueDate, now),
          userId
            ? eq(companies.userId, userId)
            : guestId
            ? eq(companies.guestId, guestId)
            : isNull(companies.id)
        )
      );

    let selectedTask;
    let mode: "DEADLINE" | "DEEP_DIVE" = "DEEP_DIVE";

    if (urgentDeadlines.length > 0) {
      // DEADLINE mode: Pick task from application with highest score
      mode = "DEADLINE";

      // Calculate scores per application
      const appScores: Map<string, { score: number; applicationId: string; nearestDue: Date }> = new Map();

      for (const ud of urgentDeadlines) {
        const appId = ud.deadlines.applicationId;
        if (!appId) continue;

        const dueDate = new Date(ud.deadlines.dueDate);
        const hoursTodue = Math.max(1, (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60));

        // Count open tasks for this application
        const appTasks = openTasks.filter((t) => t.task.applicationId === appId);
        const score = appTasks.length / hoursTodue;

        const existing = appScores.get(appId);
        if (!existing || score > existing.score) {
          appScores.set(appId, { score, applicationId: appId, nearestDue: dueDate });
        }
      }

      // Find highest score
      let highestScore = 0;
      let targetAppId: string | null = null;
      let nearestDue: Date | null = null;

      for (const [appId, data] of appScores) {
        if (data.score > highestScore || (data.score === highestScore && nearestDue && data.nearestDue < nearestDue)) {
          highestScore = data.score;
          targetAppId = appId;
          nearestDue = data.nearestDue;
        }
      }

      // Get oldest open task for target application
      if (targetAppId) {
        const appTasks = openTasks
          .filter((t) => t.task.applicationId === targetAppId)
          .sort((a, b) => new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime());

        if (appTasks.length > 0) {
          selectedTask = appTasks[0];
        }
      }

      // Fallback: any task with deadline
      if (!selectedTask) {
        const tasksWithDeadline = openTasks
          .filter((t) => t.deadline?.id)
          .sort((a, b) => {
            const aDate = a.deadline?.dueDate ? new Date(a.deadline.dueDate).getTime() : Infinity;
            const bDate = b.deadline?.dueDate ? new Date(b.deadline.dueDate).getTime() : Infinity;
            return aDate - bDate;
          });

        if (tasksWithDeadline.length > 0) {
          selectedTask = tasksWithDeadline[0];
        }
      }
    }

    if (!selectedTask) {
      // DEEP_DIVE mode: ES → GAKUCHIKA → OTHER
      mode = "DEEP_DIVE";

      const typePriority: Record<string, number> = {
        es: 0,
        gakuchika: 1,
        self_analysis: 2,
        web_test: 3,
        video: 4,
        other: 5,
      };

      // Sort by type priority, then company creation date, then task creation date
      const sortedTasks = [...openTasks].sort((a, b) => {
        // Type priority
        const aPriority = typePriority[a.task.type] ?? 5;
        const bPriority = typePriority[b.task.type] ?? 5;
        if (aPriority !== bPriority) return aPriority - bPriority;

        // Company creation date (earlier = higher priority)
        const aCompanyDate = a.company?.createdAt ? new Date(a.company.createdAt).getTime() : Infinity;
        const bCompanyDate = b.company?.createdAt ? new Date(b.company.createdAt).getTime() : Infinity;
        if (aCompanyDate !== bCompanyDate) return aCompanyDate - bCompanyDate;

        // Task creation date (earlier = higher priority)
        return new Date(a.task.createdAt).getTime() - new Date(b.task.createdAt).getTime();
      });

      selectedTask = sortedTasks[0];
    }

    if (!selectedTask) {
      return NextResponse.json({
        mode: null,
        task: null,
        message: "推薦タスクがありません",
      });
    }

    return NextResponse.json({
      mode,
      task: {
        ...selectedTask.task,
        company: selectedTask.company
          ? {
              id: selectedTask.company.id,
              name: selectedTask.company.name,
            }
          : null,
        application: selectedTask.application
          ? {
              id: selectedTask.application.id,
              name: selectedTask.application.name,
            }
          : null,
        deadline: selectedTask.deadline
          ? {
              id: selectedTask.deadline.id,
              title: selectedTask.deadline.title,
              dueDate: selectedTask.deadline.dueDate,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error getting today's task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
