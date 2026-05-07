/**
 * Companies API
 *
 * GET: List all companies for the user/guest
 * POST: Create a new company
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/crypto";
import { CompanyStatus, VALID_STATUSES } from "@/lib/constants/status";
import { stripCompanyCredentials, stripCompanyCredentialsList } from "@/lib/db/sanitize";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { createServerTimingRecorder } from "@/bff/api/server-timing";
import { getRequestIdentity } from "@/bff/identity/request-identity";
import { getCompaniesPageData } from "@/lib/server/app-loaders";
import { normalizeCompanyUrlField } from "@/app/api/companies/_shared/url-validation";

// Plan limits for companies
const COMPANY_LIMITS = {
  guest: 3,
  free: 5,
  standard: Infinity,
  pro: Infinity,
};

/**
 * Get current user or guest from request
 */
async function getCurrentIdentity(request: NextRequest) {
  const identity = await getRequestIdentity(request);
  if (!identity) {
    return null;
  }

  if (identity.userId) {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, identity.userId))
      .limit(1);

    return {
      type: "user" as const,
      userId: identity.userId,
      guestId: null,
      plan: profile?.plan || "free",
    };
  }

  return {
    type: "guest" as const,
    userId: null,
    guestId: identity.guestId,
    plan: "guest" as const,
  };
}

export async function GET(request: NextRequest) {
  const timing = createServerTimingRecorder();
  try {
    const identity = await timing.measure("identity", () => getCurrentIdentity(request));

    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANIES_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "companies-auth",
      });
    }

    const data = await timing.measure("db", () =>
      getCompaniesPageData({ userId: identity.userId, guestId: identity.guestId })
    );
    return timing.apply(NextResponse.json({
      ...data,
      companies: stripCompanyCredentialsList(data.companies),
    }));
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANIES_FETCH_FAILED",
      userMessage: "企業一覧を読み込めませんでした。",
      action: "ページを再読み込みして、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "list-companies",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getCurrentIdentity(request);

    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "COMPANY_CREATE_AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "時間を置いて再読み込みしてください。",
        retryable: true,
        developerMessage: "Authentication required",
        logContext: "company-create-auth",
      });
    }

    const body = await request.json();
    const { name, industry, recruitmentUrl, corporateUrl, mypageUrl, mypageLoginId, mypagePassword, notes, status } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "COMPANY_NAME_REQUIRED",
        userMessage: "企業名を入力してください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Company name is required",
        logContext: "company-create-validation",
      });
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "COMPANY_STATUS_INVALID",
        userMessage: "企業ステータスを確認して、もう一度お試しください。",
        action: "入力内容を確認して、もう一度お試しください。",
        developerMessage: "Invalid status",
        logContext: "company-create-validation",
      });
    }

    const normalizedRecruitmentUrl = await normalizeCompanyUrlField(request, "recruitmentUrl", recruitmentUrl);
    if (normalizedRecruitmentUrl.response) return normalizedRecruitmentUrl.response;
    const normalizedCorporateUrl = await normalizeCompanyUrlField(request, "corporateUrl", corporateUrl);
    if (normalizedCorporateUrl.response) return normalizedCorporateUrl.response;
    const normalizedMypageUrl = await normalizeCompanyUrlField(request, "mypageUrl", mypageUrl);
    if (normalizedMypageUrl.response) return normalizedMypageUrl.response;

    // Build where clause based on identity
    const whereClause = identity.type === "user"
      ? eq(companies.userId, identity.userId!)
      : eq(companies.guestId, identity.guestId!);

    // Check for duplicate company name (normalized)
    const normalizedName = name.trim()
      .replace(/株式会社|（株）|\(株\)|㈱/g, "")
      .replace(/\s+/g, "")
      .toLowerCase();

    const existingCompanies = await db
      .select()
      .from(companies)
      .where(whereClause);

    const duplicate = existingCompanies.find((c) => {
      const existingNormalized = c.name
        .replace(/株式会社|（株）|\(株\)|㈱/g, "")
        .replace(/\s+/g, "")
        .toLowerCase();
      return existingNormalized === normalizedName;
    });

    if (duplicate) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "COMPANY_DUPLICATE",
        userMessage: "同じ名前の企業が既に登録されています。",
        action: "登録済みの企業を確認してください。",
        developerMessage: "Duplicate company name",
        logContext: "company-create-duplicate",
        extra: {
          existingCompany: { id: duplicate.id, name: duplicate.name },
        },
      });
    }

    // Check company limit
    const limit = COMPANY_LIMITS[identity.plan];
    if (existingCompanies.length >= limit) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "COMPANY_LIMIT_REACHED",
        userMessage: identity.type === "guest"
            ? "ゲストユーザーは最大3社まで登録できます。ログインすると制限が解除されます。"
            : identity.plan === "free"
            ? "無料プランは最大5社まで登録できます。プランをアップグレードして無制限に登録しましょう。"
            : "企業の登録上限に達しました。",
        action: "登録済み企業を整理するか、プランを確認してください。",
        developerMessage: "Company limit reached",
        logContext: "company-create-limit",
        extra: {
          limit,
          currentCount: existingCompanies.length,
        },
      });
    }

    // Create company
    const now = new Date();
    const newCompany = {
      id: crypto.randomUUID(),
      userId: identity.type === "user" ? identity.userId : null,
      guestId: identity.type === "guest" ? identity.guestId : null,
      name: name.trim(),
      industry: industry?.trim() || null,
      recruitmentUrl: normalizedRecruitmentUrl.value,
      corporateUrl: normalizedCorporateUrl.value,
      mypageUrl: normalizedMypageUrl.value,
      mypageLoginId: mypageLoginId?.trim() || null,
      mypagePassword: mypagePassword?.trim() ? encrypt(mypagePassword.trim()) : null,
      notes: notes?.trim() || null,
      status: (status as CompanyStatus) || "inbox",
      infoFetchedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(companies).values(newCompany);

    return NextResponse.json({
      company: stripCompanyCredentials(newCompany),
      message: "Company created successfully",
    });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "COMPANY_CREATE_FAILED",
      userMessage: "企業を登録できませんでした。",
      action: "時間を置いて、もう一度お試しください。",
      retryable: true,
      error,
      developerMessage: "Internal server error",
      logContext: "create-company",
    });
  }
}
