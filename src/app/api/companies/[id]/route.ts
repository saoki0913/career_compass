/**
 * Individual Company API
 *
 * GET: Get a single company by ID
 * PUT: Update a company
 * DELETE: Delete a company
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, userProfiles, deadlines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { VALID_STATUSES } from "@/lib/constants/status";
import { stripCompanyCredentials } from "@/lib/db/sanitize";
import { encrypt } from "@/lib/crypto";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";

/**
 * Get current user or guest from request
 */
async function getCurrentIdentity(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.id) {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .limit(1);

    return {
      type: "user" as const,
      userId: session.user.id,
      guestId: null,
      plan: profile?.plan || "free",
    };
  }

  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return {
        type: "guest" as const,
        userId: null,
        guestId: guest.id,
        plan: "guest" as const,
      };
    }
  }

  return null;
}

/**
 * Check if company belongs to the current user/guest
 */
async function getCompanyIfOwned(companyId: string, identity: NonNullable<Awaited<ReturnType<typeof getCurrentIdentity>>>) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    return null;
  }

  // Check ownership
  if (identity.type === "user") {
    if (company.userId !== identity.userId) {
      return null;
    }
  } else {
    if (company.guestId !== identity.guestId) {
      return null;
    }
  }

  return company;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANY_DETAIL_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "get-company-auth",
      });
    }

    const company = await getCompanyIfOwned(id, identity);

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりませんでした。",
        action: "一覧に戻って、対象の企業を選び直してください。",
        developerMessage: "Company not found",
        logContext: "get-company-not-found",
      });
    }

    // Get deadlines for this company
    const companyDeadlines = await db
      .select()
      .from(deadlines)
      .where(eq(deadlines.companyId, id));

    return NextResponse.json({
      company: stripCompanyCredentials(company),
      deadlines: companyDeadlines,
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_DETAIL_FETCH_FAILED",
      userMessage: "企業情報を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "get-company",
    });
  }
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANY_UPDATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "update-company-auth",
      });
    }

    const company = await getCompanyIfOwned(id, identity);

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_UPDATE_NOT_FOUND",
        userMessage: "更新対象の企業が見つかりませんでした。",
        action: "一覧に戻って、対象の企業を選び直してください。",
        developerMessage: "Company not found",
        logContext: "update-company-not-found",
      });
    }

    const body = await request.json();
    const { name, industry, recruitmentUrl, corporateUrl, mypageUrl, mypageLoginId, mypagePassword, notes, status, sortOrder, isPinned } = body;

    // Validate name if provided
    if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "COMPANY_NAME_EMPTY",
        userMessage: "企業名を入力してください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Company name cannot be empty",
        logContext: "update-company-validation",
      });
    }

    // Validate status if provided
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "COMPANY_STATUS_INVALID",
        userMessage: "企業ステータスを確認して、もう一度お試しください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Invalid status",
        logContext: "update-company-validation",
      });
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (industry !== undefined) updateData.industry = industry?.trim() || null;
    if (recruitmentUrl !== undefined) updateData.recruitmentUrl = recruitmentUrl?.trim() || null;
    if (corporateUrl !== undefined) updateData.corporateUrl = corporateUrl?.trim() || null;
    if (mypageUrl !== undefined) updateData.mypageUrl = mypageUrl?.trim() || null;
    if (mypageLoginId !== undefined && mypageLoginId !== null && mypageLoginId.trim() !== "") updateData.mypageLoginId = mypageLoginId.trim();
    if (mypagePassword !== undefined && mypagePassword !== null && mypagePassword.trim() !== "") updateData.mypagePassword = encrypt(mypagePassword.trim());
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (status !== undefined) updateData.status = status;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isPinned !== undefined) updateData.isPinned = isPinned;

    await db
      .update(companies)
      .set(updateData)
      .where(eq(companies.id, id));

    // Get updated company
    const [updatedCompany] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    return NextResponse.json({
      company: updatedCompany ? stripCompanyCredentials(updatedCompany) : null,
      message: "Company updated successfully",
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_UPDATE_FAILED",
      userMessage: "企業情報を更新できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "update-company",
    });
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANY_DELETE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "delete-company-auth",
      });
    }

    const company = await getCompanyIfOwned(id, identity);

    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_DELETE_NOT_FOUND",
        userMessage: "削除対象の企業が見つかりませんでした。",
        action: "一覧に戻って、対象の企業を選び直してください。",
        developerMessage: "Company not found",
        logContext: "delete-company-not-found",
      });
    }

    // Delete company (deadlines will cascade delete due to schema)
    await db
      .delete(companies)
      .where(eq(companies.id, id));

    return NextResponse.json({
      message: "Company deleted successfully",
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_DELETE_FAILED",
      userMessage: "企業を削除できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "delete-company",
    });
  }
}
