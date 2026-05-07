/**
 * Application API
 *
 * GET: Get application details
 * PUT: Update application
 * DELETE: Delete application
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { applications, companies, deadlines, jobTypes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { buildOwnedRowCondition, getOwnedApplicationRecord } from "@/bff/identity/owner-access";
import { parseStringArrayCompat } from "@/lib/db/jsonb-compat";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { logError } from "@/lib/logger";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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
        code: "APPLICATION_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        developerMessage: "Authentication required",
        logContext: "delete-application-auth",
      });
    }

    const application = await getOwnedApplicationRecord(applicationId, identity);

    if (!application) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    // Get company
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, application.companyId))
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
        ...application,
        phase: parseStringArrayCompat(application.phase),
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

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const existingApp = await getOwnedApplicationRecord(applicationId, identity);

    if (!existingApp) {
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
      if (!isStringArray(phase)) {
        return NextResponse.json(
          { error: "無効な選考フェーズです" },
          { status: 400 }
        );
      }
      updateData.phase = phase;
    }
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder;
    }

    const updated = await db
      .update(applications)
      .set(updateData)
      .where(buildOwnedRowCondition(eq(applications.id, applicationId), applications, identity)!)
      .returning();

    if (!updated[0]) {
      return NextResponse.json(
        { error: "Application not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      application: {
        ...updated[0],
        phase: parseStringArrayCompat(updated[0].phase),
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

    const identity = await getRequestIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const appToDelete = await getOwnedApplicationRecord(applicationId, identity);

    if (!appToDelete) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "APPLICATION_DELETE_NOT_FOUND",
        userMessage: "削除対象の選考が見つかりませんでした。",
        action: "一覧に戻って、対象の選考を選び直してください。",
        developerMessage: "Application not found",
        logContext: "delete-application-not-found",
      });
    }

    // Delete application (cascades to job types, deadlines, etc.)
    const deleted = await db
      .delete(applications)
      .where(buildOwnedRowCondition(eq(applications.id, applicationId), applications, identity)!)
      .returning({ id: applications.id });

    if (!deleted[0]) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "APPLICATION_DELETE_NOT_FOUND",
        userMessage: "削除対象の選考が見つかりませんでした。",
        action: "一覧に戻って、対象の選考を選び直してください。",
        developerMessage: "Application not found",
        logContext: "delete-application-not-found",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("delete-application", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "APPLICATION_DELETE_FAILED",
      userMessage: "選考を削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "delete-application",
    });
  }
}
