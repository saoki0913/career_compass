/**
 * Company Deadlines API
 *
 * GET: Get all deadlines for a company
 * POST: Create a new deadline for a company
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

interface CreateDeadlineBody {
  type: DeadlineType;
  title: string;
  description?: string;
  memo?: string;
  dueDate: string;
  sourceUrl?: string;
}

async function verifyCompanyAccess(
  companyId: string,
  request: NextRequest
): Promise<{ valid: boolean; error?: string }> {
  // Try authenticated session first
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    // Check if company belongs to user
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.userId, session.user.id)))
      .limit(1);

    if (!company) {
      return { valid: false, error: "Company not found" };
    }
    return { valid: true };
  }

  // Try guest token
  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      const [company] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.guestId, guest.id)))
        .limit(1);

      if (!company) {
        return { valid: false, error: "Company not found" };
      }
      return { valid: true };
    }
  }

  return { valid: false, error: "Authentication required" };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    const access = await verifyCompanyAccess(companyId, request);
    if (!access.valid) {
      return NextResponse.json(
        { error: access.error },
        { status: access.error === "Authentication required" ? 401 : 404 }
      );
    }

    // Get all deadlines for the company
    const companyDeadlines = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.companyId, companyId))
      .orderBy(deadlines.dueDate);

    return NextResponse.json({
      deadlines: companyDeadlines.map((d) => ({
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
      })),
    });
  } catch (error) {
    console.error("Error getting deadlines:", error);
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
    const { id: companyId } = await params;

    const access = await verifyCompanyAccess(companyId, request);
    if (!access.valid) {
      return NextResponse.json(
        { error: access.error },
        { status: access.error === "Authentication required" ? 401 : 404 }
      );
    }

    // Get user identity for task creation
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    let userId: string | null = null;
    let guestId: string | null = null;

    if (session?.user?.id) {
      userId = session.user.id;
    } else {
      const deviceToken = request.headers.get("x-device-token");
      if (deviceToken) {
        const guest = await getGuestUser(deviceToken);
        if (guest) {
          guestId = guest.id;
        }
      }
    }

    const body: CreateDeadlineBody = await request.json();

    // Validate required fields
    if (!body.type || !VALID_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: "Invalid deadline type" },
        { status: 400 }
      );
    }

    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    if (!body.dueDate) {
      return NextResponse.json(
        { error: "Due date is required" },
        { status: 400 }
      );
    }

    const dueDate = new Date(body.dueDate);
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

    const now = new Date();
    const deadlineId = crypto.randomUUID();
    const newDeadline = await db
      .insert(deadlines)
      .values({
        id: deadlineId,
        companyId,
        type: body.type,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        memo: body.memo?.trim() || null,
        dueDate,
        isConfirmed: true, // Manually added deadlines are confirmed by default
        confidence: null,
        sourceUrl: body.sourceUrl?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Auto-create standard tasks for confirmed ES submission deadlines
    if (body.type === "es_submission") {
      const standardTasks = [
        {
          id: crypto.randomUUID(),
          userId,
          guestId,
          companyId,
          applicationId: null,
          deadlineId,
          title: "ES作成",
          description: null,
          type: "es" as const,
          status: "open" as const,
          dueDate,
          isAutoGenerated: true,
          sortOrder: 0,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          userId,
          guestId,
          companyId,
          applicationId: null,
          deadlineId,
          title: "提出物準備",
          description: null,
          type: "other" as const,
          status: "open" as const,
          dueDate,
          isAutoGenerated: true,
          sortOrder: 1,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          userId,
          guestId,
          companyId,
          applicationId: null,
          deadlineId,
          title: "提出",
          description: null,
          type: "other" as const,
          status: "open" as const,
          dueDate,
          isAutoGenerated: true,
          sortOrder: 2,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ];

      await db.insert(tasks).values(standardTasks);
    }

    return NextResponse.json({
      success: true,
      deadline: {
        id: newDeadline[0].id,
        companyId: newDeadline[0].companyId,
        type: newDeadline[0].type,
        title: newDeadline[0].title,
        description: newDeadline[0].description,
        memo: newDeadline[0].memo,
        dueDate: newDeadline[0].dueDate?.toISOString(),
        isConfirmed: newDeadline[0].isConfirmed,
        confidence: newDeadline[0].confidence,
        sourceUrl: newDeadline[0].sourceUrl,
        completedAt: null,
        createdAt: newDeadline[0].createdAt?.toISOString(),
        updatedAt: newDeadline[0].updatedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error creating deadline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
