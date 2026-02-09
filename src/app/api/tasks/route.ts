/**
 * Tasks API
 *
 * GET: List tasks with filters
 * POST: Create a new task
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { tasks, companies, applications, deadlines } from "@/lib/db/schema";
import { eq, and, or, desc, asc, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";

const TASK_TYPE_LABELS: Record<string, string> = {
  es: "ES作成",
  web_test: "WEBテスト",
  self_analysis: "自己分析",
  gakuchika: "ガクチカ",
  video: "動画・録画",
  other: "その他",
};

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
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // open, done, all
    const companyId = searchParams.get("companyId");
    const applicationId = searchParams.get("applicationId");

    // Build where clause
    const conditions = [];

    if (userId) {
      conditions.push(eq(tasks.userId, userId));
    } else if (guestId) {
      conditions.push(eq(tasks.guestId, guestId));
    }

    if (status && status !== "all") {
      conditions.push(eq(tasks.status, status as "open" | "done"));
    }

    if (companyId) {
      conditions.push(eq(tasks.companyId, companyId));
    }

    if (applicationId) {
      conditions.push(eq(tasks.applicationId, applicationId));
    }

    const taskList = await db
      .select({
        task: tasks,
        company: {
          id: companies.id,
          name: companies.name,
        },
        application: {
          id: applications.id,
          name: applications.name,
        },
        deadline: {
          id: deadlines.id,
          title: deadlines.title,
          dueDate: deadlines.dueDate,
        },
      })
      .from(tasks)
      .leftJoin(companies, eq(tasks.companyId, companies.id))
      .leftJoin(applications, eq(tasks.applicationId, applications.id))
      .leftJoin(deadlines, eq(tasks.deadlineId, deadlines.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        asc(tasks.status), // open first
        asc(tasks.dueDate), // earliest due date
        desc(tasks.createdAt)
      );

    return NextResponse.json({
      tasks: taskList.map((t) => ({
        ...t.task,
        company: t.company?.id ? t.company : null,
        application: t.application?.id ? t.application : null,
        deadline: t.deadline?.id ? t.deadline : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { title, description, type, companyId, applicationId, deadlineId, dueDate } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 }
      );
    }

    const validTypes = Object.keys(TASK_TYPE_LABELS);
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: "有効なタイプを選択してください" },
        { status: 400 }
      );
    }

    // Verify company access if provided
    if (companyId) {
      const [company] = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.id, companyId),
            userId
              ? eq(companies.userId, userId)
              : guestId
              ? eq(companies.guestId, guestId)
              : isNull(companies.id)
          )
        )
        .limit(1);

      if (!company) {
        return NextResponse.json(
          { error: "企業が見つかりません" },
          { status: 404 }
        );
      }
    }

    const now = new Date();
    const newTask = await db
      .insert(tasks)
      .values({
        id: crypto.randomUUID(),
        userId,
        guestId,
        title: title.trim(),
        description: description?.trim() || null,
        type,
        companyId: companyId || null,
        applicationId: applicationId || null,
        deadlineId: deadlineId || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        isAutoGenerated: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ task: newTask[0] });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
