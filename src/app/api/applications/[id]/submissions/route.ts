/**
 * Submission Items API
 *
 * GET: List submission items for an application
 * POST: Add a submission item
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { submissionItems, applications } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { logError } from "@/lib/logger";
import { parseBody, submissionCreateSchema } from "@/lib/validation";

async function verifyApplicationAccess(
  applicationId: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

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

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログインまたはゲストセッションが必要です。",
        action: "ログインし直して、もう一度お試しください。",
      });
    }

    const hasAccess = await verifyApplicationAccess(
      applicationId,
      identity.userId,
      identity.guestId
    );

    if (!hasAccess) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "APPLICATION_NOT_FOUND",
        userMessage: "対象の応募情報が見つかりませんでした。",
        action: "一覧へ戻って、対象データを選び直してください。",
      });
    }

    const items = await db
      .select()
      .from(submissionItems)
      .where(eq(submissionItems.applicationId, applicationId))
      .orderBy(submissionItems.isRequired, desc(submissionItems.createdAt));

    return NextResponse.json({ submissions: items });
  } catch (error) {
    logError("fetch-submissions", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "FETCH_SUBMISSIONS_FAILED",
      userMessage: "提出物の取得に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      error,
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログインまたはゲストセッションが必要です。",
        action: "ログインし直して、もう一度お試しください。",
      });
    }

    const { userId, guestId } = identity;
    const hasAccess = await verifyApplicationAccess(applicationId, userId, guestId);

    if (!hasAccess) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "APPLICATION_NOT_FOUND",
        userMessage: "対象の応募情報が見つかりませんでした。",
        action: "一覧へ戻って、対象データを選び直してください。",
      });
    }

    const parsed = await parseBody(request, submissionCreateSchema, {
      request,
      code: "INVALID_SUBMISSION_CREATE",
      logContext: "create-submission:validation",
    });
    if (parsed.error) return parsed.error;
    const { type, name, isRequired, notes } = parsed.data;

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
    logError("create-submission", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "CREATE_SUBMISSION_FAILED",
      userMessage: "提出物の作成に失敗しました。",
      action: "少し時間をおいて、もう一度お試しください。",
      error,
    });
  }
}
