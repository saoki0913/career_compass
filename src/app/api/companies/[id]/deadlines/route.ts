/**
 * Company Deadlines API
 *
 * GET: Get all deadlines for a company
 * POST: Create a new deadline for a company
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deadlines, companies } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { syncDeadlineImmediately, type ImmediateSyncResult } from "@/lib/calendar/sync";
import { generateTasksForDeadline } from "@/lib/server/task-generation";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";

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
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return { valid: false, error: "Authentication required" };
  }

  if (identity.userId) {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.userId, identity.userId)))
      .limit(1);

    if (!company) {
      return { valid: false, error: "Company not found" };
    }
    return { valid: true };
  }

  if (identity.guestId) {
    const [company] = await db
      .select()
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.guestId, identity.guestId)))
      .limit(1);

    if (!company) {
      return { valid: false, error: "Company not found" };
    }
    return { valid: true };
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
    const identity = await getRequestIdentity(request);
    const userId: string | null = identity?.userId ?? null;
    const guestId: string | null = identity?.guestId ?? null;

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
        googleSyncStatus: userId ? "idle" : "suppressed",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Auto-create tasks from templates for confirmed deadlines (all types)
    await generateTasksForDeadline({
      deadlineId,
      deadlineType: body.type,
      deadlineDueDate: dueDate,
      companyId,
      applicationId: null,
      userId,
      guestId,
    });

    let calendarSync: ImmediateSyncResult | undefined;
    if (userId) {
      calendarSync = await syncDeadlineImmediately(userId, deadlineId);
    }

    const [storedDeadline] = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.id, deadlineId))
      .limit(1);

    return NextResponse.json({
      success: true,
      calendarSync,
      deadline: {
        id: storedDeadline?.id ?? newDeadline[0].id,
        companyId: storedDeadline?.companyId ?? newDeadline[0].companyId,
        type: storedDeadline?.type ?? newDeadline[0].type,
        title: storedDeadline?.title ?? newDeadline[0].title,
        description: storedDeadline?.description ?? newDeadline[0].description,
        memo: storedDeadline?.memo ?? newDeadline[0].memo,
        dueDate: storedDeadline?.dueDate?.toISOString() ?? newDeadline[0].dueDate?.toISOString(),
        isConfirmed: storedDeadline?.isConfirmed ?? newDeadline[0].isConfirmed,
        confidence: storedDeadline?.confidence ?? newDeadline[0].confidence,
        sourceUrl: storedDeadline?.sourceUrl ?? newDeadline[0].sourceUrl,
        googleSyncStatus: storedDeadline?.googleSyncStatus ?? "idle",
        googleSyncError: storedDeadline?.googleSyncError ?? null,
        completedAt: storedDeadline?.completedAt?.toISOString() ?? null,
        createdAt: storedDeadline?.createdAt?.toISOString() ?? newDeadline[0].createdAt?.toISOString(),
        updatedAt: storedDeadline?.updatedAt?.toISOString() ?? newDeadline[0].updatedAt?.toISOString(),
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
