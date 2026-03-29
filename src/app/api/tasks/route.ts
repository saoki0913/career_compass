/**
 * Tasks API
 *
 * GET: List tasks with filters
 * POST: Create a new task
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import {
  hasOwnedApplication,
  hasOwnedCompany,
  hasOwnedDeadline,
} from "@/app/api/_shared/owner-access";
import { getTasksPageData } from "@/lib/server/task-loaders";

const TASK_TYPE_LABELS: Record<string, string> = {
  es: "ES作成",
  web_test: "WEBテスト",
  self_analysis: "自己分析",
  gakuchika: "ガクチカ",
  video: "動画・録画",
  other: "その他",
};

export async function GET(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "TASKS_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "tasks-auth",
      });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // open, done, all
    const companyId = searchParams.get("companyId");
    const applicationId = searchParams.get("applicationId");

    const data = await getTasksPageData(identity, {
      status: (status as "open" | "done" | "all" | null) ?? undefined,
      companyId,
      applicationId,
    });

    return NextResponse.json(data);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "TASKS_FETCH_FAILED",
      userMessage: "タスク一覧を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "tasks-fetch",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getRequestIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "TASK_CREATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "task-create-auth",
      });
    }

    const { userId, guestId } = identity;
    const body = await request.json();
    const { title, description, type, companyId, applicationId, deadlineId, dueDate } = body;

    if (!title || !title.trim()) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "TASK_TITLE_REQUIRED",
        userMessage: "タスク名を入力してください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Task title is required",
        logContext: "task-create-validation",
      });
    }

    const validTypes = Object.keys(TASK_TYPE_LABELS);
    if (!type || !validTypes.includes(type)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "TASK_TYPE_INVALID",
        userMessage: "タスク種別を確認して、もう一度お試しください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Invalid task type",
        logContext: "task-create-validation",
      });
    }

    // Verify related resource access if provided
    if (companyId) {
      const hasCompany = await hasOwnedCompany(companyId, { userId, guestId });
      if (!hasCompany) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "TASK_COMPANY_NOT_FOUND",
          userMessage: "関連する企業が見つかりませんでした。",
          action: "企業の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Company not found for task create",
          logContext: "task-create-validation",
        });
      }
    }

    if (applicationId) {
      const hasApplication = await hasOwnedApplication(applicationId, { userId, guestId });
      if (!hasApplication) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "TASK_APPLICATION_NOT_FOUND",
          userMessage: "関連する応募情報が見つかりませんでした。",
          action: "応募情報の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Application not found for task create",
          logContext: "task-create-validation",
        });
      }
    }

    if (deadlineId) {
      const hasDeadline = await hasOwnedDeadline(deadlineId, { userId, guestId });
      if (!hasDeadline) {
        return createApiErrorResponse(request, {
          status: 404,
          code: "TASK_DEADLINE_NOT_FOUND",
          userMessage: "関連する締切が見つかりませんでした。",
          action: "締切の選択内容を確認して、もう一度お試しください。",
          developerMessage: "Deadline not found for task create",
          logContext: "task-create-validation",
        });
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
    return createApiErrorResponse(request, {
      status: 500,
      code: "TASK_CREATE_FAILED",
      userMessage: "タスクを作成できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "task-create",
    });
  }
}
