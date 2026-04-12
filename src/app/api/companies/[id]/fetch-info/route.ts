/**
 * Selection Schedule Fetch API
 *
 * POST: Fetch selection schedule information from recruitment URL
 * - Validates user/guest authentication
 * - Checks credits / monthly schedule free quota (via companyFetchPolicy)
 * - Calls FastAPI backend
 * - Saves extracted deadlines on success (via saveExtractedDeadlines)
 * - Consumes credits only on success
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { getRequestIdentity } from "@/app/api/_shared/request-identity";
import { getOwnedCompanyRecord } from "@/app/api/_shared/owner-access";
import { db } from "@/lib/db";
import { companies, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRemainingFreeFetches } from "@/lib/credits";
import { enforceRateLimitLayers, FETCH_INFO_RATE_LAYERS } from "@/lib/rate-limit-spike";
import { logError } from "@/lib/logger";
import { checkPublicSourceCompliance } from "@/lib/company-info/source-compliance";
import { validatePublicUrl } from "@/lib/security/public-url";
import {
  getRequestId,
  logAiCreditCostSummary,
  splitInternalTelemetry,
} from "@/lib/ai/cost-summary-log";
import { fetchFastApiInternal } from "@/lib/fastapi/client";
import { companyFetchPolicy } from "@/lib/api-route/billing/company-fetch-policy";
import { saveExtractedDeadlines } from "@/lib/company-info/deadline-persistence";
import type { ExtractedDeadline } from "@/lib/company-info/deadline-persistence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedDocument {
  name: string;
  required: boolean;
  source_url: string;
  confidence: string;
}

interface FetchResult {
  success: boolean;
  partial_success?: boolean;
  source_type?: "official" | "job_site" | "parent" | "subsidiary" | "blog" | "other";
  relation_company_name?: string | null;
  year_matched?: boolean | null;
  used_graduation_year?: number | null;
  data?: {
    deadlines: ExtractedDeadline[];
    recruitment_types?: { name: string; source_url: string; confidence: string }[];
    required_documents: ExtractedDocument[];
    application_method: { value: string; source_url: string; confidence: string } | null;
    selection_process: { value: string; source_url: string; confidence: string } | null;
  };
  source_url: string;
  extracted_at: string;
  error?: string;
  deadlines_found?: boolean;
  other_items_found?: boolean;
  raw_text?: string | null;
  raw_html?: string | null;
}

type FetchInfoResultStatus = "success" | "duplicates_only" | "no_deadlines" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** FastAPI HTTPException(detail={ error, error_type, ... }) from company-info LLM routes */
function userFacingScheduleFetchError(detail: unknown): {
  userMessage: string;
  action: string;
  retryable: boolean;
  llmErrorType: string;
} | null {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  const d = detail as { error?: string; error_type?: string };
  const t = d.error_type;
  if (!t || typeof t !== "string") {
    return null;
  }
  const msg =
    typeof d.error === "string" && d.error.trim()
      ? d.error
      : "情報の取得に失敗しました。時間を置いて、もう一度お試しください。";
  if (t === "no_api_key") {
    return {
      userMessage: "AI機能の設定に問題があります。",
      action: "管理者にお問い合わせください。",
      retryable: false,
      llmErrorType: t,
    };
  }
  return {
    userMessage: msg,
    action: "時間を置いて、もう一度お試しください。",
    retryable: true,
    llmErrorType: t,
  };
}

async function resolveFetchInfoIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
  plan: "guest" | "free" | "standard" | "pro";
} | null> {
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
      userId: identity.userId,
      guestId: null,
      plan: (profile?.plan || "free") as "free" | "standard" | "pro",
    };
  }

  return {
    userId: null,
    guestId: identity.guestId,
    plan: "guest",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;
    const requestId = getRequestId(request);

    // Get URL and optional parameters from request body
    const body = await request.json().catch(() => ({}));
    const requestUrl = body.url as string | undefined;
    const selectionType = body.selectionType as "main_selection" | "internship" | undefined;
    const graduationYear = body.graduationYear as number | undefined;

    // Get identity
    const identity = await resolveFetchInfoIdentity(request);
    if (!identity) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTHENTICATION_REQUIRED",
        userMessage: "ログインが必要です。",
        action: "ログインしてから、もう一度お試しください。",
      });
    }

    const { userId, guestId, plan } = identity;

    if (guestId && !userId) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "LOGIN_REQUIRED_FOR_SCHEDULE_FETCH",
        userMessage: "選考スケジュール取得はログインが必要です。",
        action: "ログイン後に、もう一度お試しください。",
      });
    }

    const rateLimited = await enforceRateLimitLayers(
      request,
      [...FETCH_INFO_RATE_LAYERS],
      userId,
      guestId,
      "companies_fetch_info"
    );
    if (rateLimited) {
      return rateLimited;
    }

    const company = await getOwnedCompanyRecord(companyId, { userId, guestId });
    if (!company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりません。",
        action: "一覧から企業を選び直してください。",
      });
    }

    // Use provided URL or fall back to company's recruitment URL
    const urlToFetch = requestUrl || company.recruitmentUrl;
    if (!urlToFetch) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "RECRUITMENT_URL_REQUIRED",
        userMessage: "採用ページURLが登録されていません。",
        action: "取得する公開ページURLを選択してください。",
      });
    }

    // SSRF protection: Validate URL before fetching
    const urlValidation = await validatePublicUrl(urlToFetch);
    if (!urlValidation.allowed) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "INVALID_RECRUITMENT_URL",
        userMessage: urlValidation.userMessage || "無効なURLです。",
        action: "公開された HTTPS のURLを指定してください。",
      });
    }

    const compliance = await checkPublicSourceCompliance(urlToFetch);
    if (compliance.status === "blocked") {
      return createApiErrorResponse(request, {
        status: 400,
        code: "PUBLIC_SOURCE_BLOCKED",
        userMessage: compliance.reasons[0] || "公開ページのみ取得できます。",
        action: "ログイン不要の公開ページURLを選び直してください。",
        extra: {
          blockedUrl: compliance.url,
          reasons: compliance.reasons,
        },
      });
    }

    // Billing precheck: monthly free quota OR 1 credit required.
    // Guest requests are already rejected above; userId is non-null here.
    const billingCtx = {
      userId: userId!,
      guestId: null as null,
      companyId,
      companyName: company.name,
      plan: plan as "free" | "standard" | "pro",
    };
    const precheckResult = await companyFetchPolicy.precheck(billingCtx);
    if (!precheckResult.ok) {
      return createApiErrorResponse(request, {
        status: 402,
        code: "INSUFFICIENT_CREDITS",
        userMessage: "クレジットが不足しています。",
        action: "プランまたは残高を確認してください。",
      });
    }
    const useMonthlyScheduleFree = precheckResult.freeQuotaAvailable;

    // Get user's graduation year from profile if not provided in request
    let effectiveGraduationYear = graduationYear;
    if (!effectiveGraduationYear && userId) {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      effectiveGraduationYear = profile?.graduationYear || undefined;
    }

    // Call FastAPI backend with graduation year and selection type
    let fetchResult: FetchResult;
    let telemetry = null;
    try {
      const response = await fetchFastApiInternal("/company-info/fetch-schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
        body: JSON.stringify({
          url: urlToFetch,
          company_name: company.name,
          graduation_year: effectiveGraduationYear,
          selection_type: selectionType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const llmMapped = userFacingScheduleFetchError(errorData.detail);
        if (llmMapped) {
          return createApiErrorResponse(request, {
            status: 503,
            code: "SCHEDULE_FETCH_FAILED",
            userMessage: llmMapped.userMessage,
            action: llmMapped.action,
            retryable: llmMapped.retryable,
            llmErrorType: llmMapped.llmErrorType,
            extra: { source: "fastapi_fetch_schedule" },
          });
        }
        // Handle error detail that might be an object
        let errorMessage = "Backend request failed";
        if (errorData.detail) {
          if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else if (
            typeof errorData.detail === "object" &&
            errorData.detail !== null &&
            "message" in errorData.detail &&
            typeof (errorData.detail as { message?: string }).message === "string"
          ) {
            errorMessage = (errorData.detail as { message: string }).message;
          } else if (
            typeof errorData.detail === "object" &&
            errorData.detail !== null &&
            "error" in errorData.detail &&
            typeof (errorData.detail as { error?: string }).error === "string"
          ) {
            errorMessage = (errorData.detail as { error: string }).error;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
        throw new Error(errorMessage);
      }

      const rawFetchResult = await response.json();
      const split = splitInternalTelemetry(rawFetchResult);
      telemetry = split.telemetry;
      fetchResult = split.payload as FetchResult;
    } catch (error) {
      logError("backend-fetch", error);
      return createApiErrorResponse(request, {
        status: 503,
        code: "SCHEDULE_FETCH_FAILED",
        userMessage: "情報の取得に失敗しました。",
        action: "時間を置いて、もう一度お試しください。",
        retryable: true,
        error,
      });
    }

    const deadlinesExtractedCount = fetchResult.data?.deadlines?.length ?? 0;

    // 成功判定の細分化（SPEC.md 4.2）
    const hasDeadlines = deadlinesExtractedCount > 0;
    const hasOtherData = fetchResult.data?.application_method ||
                         (fetchResult.data?.required_documents && fetchResult.data.required_documents.length > 0) ||
                         fetchResult.data?.selection_process;

    // Handle failure from backend fetch/extract stage
    if (!fetchResult.success) {
      const resultStatus: FetchInfoResultStatus =
        hasDeadlines || hasOtherData ? "no_deadlines" : "error";
      logError("fetch-info-backend-reported-failure", new Error(fetchResult.error || "fetch_info_failed"), {
        companyId,
        sourceUrl: fetchResult.source_url,
        resultStatus,
      });
      logAiCreditCostSummary({
        feature: "selection_schedule",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return NextResponse.json({
        success: false,
        resultStatus,
        error: hasDeadlines || hasOtherData
          ? "締切は見つかりませんでしたが、取得できた情報があります。"
          : "情報を抽出できませんでした。時間を置いて、もう一度お試しください。",
        deadlinesExtractedCount,
        deadlinesSavedCount: 0,
        creditsConsumed: 0,
        freeUsed: false,
        freeRemaining: await getRemainingFreeFetches(userId, guestId, plan),
      });
    }

    // 締切なし & 他データあり = no_deadlines
    if (!hasDeadlines && hasOtherData) {
      await db
        .update(companies)
        .set({
          recruitmentUrl: urlToFetch,
          infoFetchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      const freeRemaining = await getRemainingFreeFetches(userId, guestId, plan);
      logAiCreditCostSummary({
        feature: "selection_schedule",
        requestId,
        status: "success",
        creditsUsed: 0,
        telemetry,
      });

      return NextResponse.json({
        success: false,
        resultStatus: "no_deadlines" satisfies FetchInfoResultStatus,
        partial: true,
        data: {
          deadlinesCount: 0,
          deadlineIds: [],
          applicationMethod: fetchResult.data?.application_method?.value || null,
          requiredDocuments: fetchResult.data?.required_documents?.map(d => d.name) || [],
          selectionProcess: fetchResult.data?.selection_process?.value || null,
        },
        deadlines: [],
        deadlinesExtractedCount,
        deadlinesSavedCount: 0,
        creditsConsumed: 0,
        freeUsed: false,
        freeRemaining,
        message: "締切情報は見つかりませんでしたが、他の情報を取得しました",
      });
    }

    // 締切なし & 他データもなし = 完全失敗（クレジット消費なし）
    if (!hasDeadlines && !hasOtherData) {
      logAiCreditCostSummary({
        feature: "selection_schedule",
        requestId,
        status: "failed",
        creditsUsed: 0,
        telemetry,
      });
      return NextResponse.json({
        success: false,
        resultStatus: "no_deadlines" satisfies FetchInfoResultStatus,
        error: "情報を抽出できませんでした",
        deadlinesExtractedCount,
        deadlinesSavedCount: 0,
        creditsConsumed: 0,
        freeUsed: false,
        freeRemaining: await getRemainingFreeFetches(userId, guestId, plan),
      });
    }

    // 締切あり = 完全成功: Save extracted deadlines and consume billing
    const { savedDeadlines, skippedDuplicates, savedDeadlineSummaries } =
      await saveExtractedDeadlines({
        companyId,
        extractedDeadlines: fetchResult.data?.deadlines ?? [],
        fallbackSourceUrl: urlToFetch,
      });

    const deadlinesSavedCount = savedDeadlines.length;
    const duplicatesOnly =
      deadlinesExtractedCount > 0 &&
      deadlinesSavedCount === 0 &&
      skippedDuplicates.length > 0;

    // Update company's recruitmentUrl and infoFetchedAt
    await db
      .update(companies)
      .set({
        recruitmentUrl: urlToFetch,
        infoFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Billing confirm: consume free quota or 1 credit (success only)
    await companyFetchPolicy.confirm(
      billingCtx,
      {
        kind: "billable_success",
        creditsConsumed: useMonthlyScheduleFree ? 0 : 1,
        freeQuotaUsed: useMonthlyScheduleFree,
      },
      null,
    );

    const creditsConsumed = useMonthlyScheduleFree ? 0 : 1;
    const actualCreditsDeducted = useMonthlyScheduleFree ? undefined : 1;

    // Get updated free remaining
    const freeRemaining = await getRemainingFreeFetches(userId, guestId, plan);

    if (duplicatesOnly) {
      logAiCreditCostSummary({
        feature: "selection_schedule",
        requestId,
        status: "success",
        creditsUsed: actualCreditsDeducted ?? 0,
        telemetry,
      });
      return NextResponse.json({
        success: false,
        resultStatus: "duplicates_only" satisfies FetchInfoResultStatus,
        data: {
          deadlinesCount: 0,
          deadlineIds: [],
          duplicatesSkipped: skippedDuplicates.length,
          duplicateIds: skippedDuplicates,
          applicationMethod: fetchResult.data?.application_method?.value || null,
          requiredDocuments: fetchResult.data?.required_documents?.map(d => d.name) || [],
          selectionProcess: fetchResult.data?.selection_process?.value || null,
        },
        deadlines: savedDeadlineSummaries,
        deadlinesExtractedCount,
        deadlinesSavedCount,
        creditsConsumed,
        actualCreditsDeducted,
        freeUsed: useMonthlyScheduleFree,
        freeRemaining,
        message: "取得した締切はすべて既存データと重複していたため、新規追加はありませんでした。",
      });
    }

    logAiCreditCostSummary({
      feature: "selection_schedule",
      requestId,
      status: "success",
      creditsUsed: actualCreditsDeducted ?? 0,
      telemetry,
    });
    return NextResponse.json({
      success: true,
      resultStatus: "success" satisfies FetchInfoResultStatus,
      data: {
        deadlinesCount: deadlinesSavedCount,
        deadlineIds: savedDeadlines,
        duplicatesSkipped: skippedDuplicates.length,
        duplicateIds: skippedDuplicates,
        applicationMethod: fetchResult.data?.application_method?.value || null,
        requiredDocuments: fetchResult.data?.required_documents?.map(d => d.name) || [],
        selectionProcess: fetchResult.data?.selection_process?.value || null,
      },
      deadlines: savedDeadlineSummaries,
      deadlinesExtractedCount,
      deadlinesSavedCount,
      creditsConsumed,
      actualCreditsDeducted,
      freeUsed: useMonthlyScheduleFree,
      freeRemaining,
    });
  } catch (error) {
    logError("fetch-company-info", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "INTERNAL_ERROR",
      userMessage: "選考スケジュールの取得中にエラーが発生しました。しばらく経ってからもう一度お試しください。",
      action: "retry",
    });
  }
}
