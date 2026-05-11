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
import {
  buildOwnedRowCondition,
  createOwnedResourceNotFoundResponse,
  getOwnedApplicationRecord,
  requireRequestIdentity,
} from "@/bff/identity/owner-access";
import { parseStringArrayCompat } from "@/lib/db/jsonb-compat";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { logError } from "@/lib/logger";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function applicationNotFoundResponse(request: NextRequest) {
  return createOwnedResourceNotFoundResponse(request, {
    code: "APPLICATION_NOT_FOUND",
    userMessage: "選考が見つかりませんでした。",
    action: "一覧に戻って、対象の選考を選び直してください。",
    logContext: "application-not-found",
    developerMessage: "Application not found",
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "APPLICATION_GET",
      logContext: "get-application-auth",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }
    const identity = identityResult.identity;

    const application = await getOwnedApplicationRecord(applicationId, identity);

    if (!application) {
      return applicationNotFoundResponse(request);
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
    logError("get-application", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "APPLICATION_GET_FAILED",
      userMessage: "選考情報を取得できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "get-application",
    });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "APPLICATION_UPDATE",
      logContext: "update-application-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }
    const identity = identityResult.identity;

    const existingApp = await getOwnedApplicationRecord(applicationId, identity);

    if (!existingApp) {
      return applicationNotFoundResponse(request);
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
        return createApiErrorResponse(request, {
          status: 400,
          code: "APPLICATION_INVALID_TYPE",
          userMessage: "無効なタイプです。",
          action: "選考タイプを選び直してください。",
          developerMessage: "Invalid application type",
          logContext: "update-application-invalid-type",
        });
      }
      updateData.type = type;
    }
    if (status !== undefined) {
      const validStatuses = ["active", "completed", "withdrawn"];
      if (!validStatuses.includes(status)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "APPLICATION_INVALID_STATUS",
          userMessage: "無効なステータスです。",
          action: "選考ステータスを選び直してください。",
          developerMessage: "Invalid application status",
          logContext: "update-application-invalid-status",
        });
      }
      updateData.status = status;
    }
    if (phase !== undefined) {
      if (!isStringArray(phase)) {
        return createApiErrorResponse(request, {
          status: 400,
          code: "APPLICATION_INVALID_PHASE",
          userMessage: "無効な選考フェーズです。",
          action: "選考フェーズを選び直してください。",
          developerMessage: "Invalid application phase",
          logContext: "update-application-invalid-phase",
        });
      }
      updateData.phase = phase;
    }
    if (sortOrder !== undefined) {
      updateData.sortOrder = sortOrder;
    }

    const ownedCondition = buildOwnedRowCondition(eq(applications.id, applicationId), applications, identity);
    if (!ownedCondition) {
      return applicationNotFoundResponse(request);
    }

    const updated = await db
      .update(applications)
      .set(updateData)
      .where(ownedCondition)
      .returning();

    if (!updated[0]) {
      return applicationNotFoundResponse(request);
    }

    return NextResponse.json({
      application: {
        ...updated[0],
        phase: parseStringArrayCompat(updated[0].phase),
      },
    });
  } catch (error) {
    logError("update-application", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "APPLICATION_UPDATE_FAILED",
      userMessage: "選考を更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "update-application",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    const identityResult = await requireRequestIdentity(request, {
      codePrefix: "APPLICATION_DELETE",
      logContext: "delete-application-auth",
      sessionErrorMode: "throw",
    });
    if (!identityResult.ok) {
      return identityResult.response;
    }
    const identity = identityResult.identity;

    const appToDelete = await getOwnedApplicationRecord(applicationId, identity);

    if (!appToDelete) {
      return applicationNotFoundResponse(request);
    }

    const ownedCondition = buildOwnedRowCondition(eq(applications.id, applicationId), applications, identity);
    if (!ownedCondition) {
      return applicationNotFoundResponse(request);
    }

    // Delete application (cascades to job types, deadlines, etc.)
    const deleted = await db
      .delete(applications)
      .where(ownedCondition)
      .returning({ id: applications.id });

    if (!deleted[0]) {
      return applicationNotFoundResponse(request);
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
