/**
 * Selection Schedule Fetch API
 *
 * POST: Fetch selection schedule information from recruitment URL
 * - Validates user/guest authentication
 * - Checks credits / monthly schedule free quota
 * - Calls FastAPI backend
 * - Saves extracted deadlines on success
 * - Consumes credits only on success
 */

import { NextRequest, NextResponse } from "next/server";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, deadlines, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import { getRemainingFreeFetches, hasEnoughCredits, consumeCredits } from "@/lib/credits";
import { getMonthlyScheduleFetchFreeLimit } from "@/lib/company-info/pricing";
import { incrementMonthlyScheduleFreeUse } from "@/lib/company-info/usage";
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

interface ExtractedDeadline {
  type: string;
  title: string;
  due_date: string | null;  // Backend uses snake_case
  dueDate?: string | null;  // Frontend alias
  source_url?: string;
  confidence: string;
}

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
type DeadlineType = typeof deadlines.$inferInsert.type;

async function getIdentity(request: NextRequest): Promise<{
  userId: string | null;
  guestId: string | null;
  plan: "guest" | "free" | "standard" | "pro";
} | null> {
  // Try authenticated session first
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
      userId: session.user.id,
      guestId: null,
      plan: (profile?.plan || "free") as "free" | "standard" | "pro",
    };
  }

  // Try guest token
  const deviceToken = request.headers.get("x-device-token");
  if (deviceToken) {
    const guest = await getGuestUser(deviceToken);
    if (guest) {
      return {
        userId: null,
        guestId: guest.id,
        plan: "guest",
      };
    }
  }

  return null;
}

async function verifyCompanyAccess(
  companyId: string,
  userId: string | null,
  guestId: string | null
): Promise<{ valid: boolean; company?: typeof companies.$inferSelect }> {
  const whereClause = userId
    ? and(eq(companies.id, companyId), eq(companies.userId, userId))
    : guestId
    ? and(eq(companies.id, companyId), eq(companies.guestId, guestId))
    : null;

  if (!whereClause) {
    return { valid: false };
  }

  const [company] = await db.select().from(companies).where(whereClause).limit(1);

  if (!company) {
    return { valid: false };
  }

  return { valid: true, company };
}

/**
 * Normalize title for comparison (remove variations like parentheses, ordinal numbers)
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, "")                           // Remove spaces
    .replace(/[（(][^）)]*[）)]/g, "")              // Remove content in parentheses
    .replace(/第?[一二三四五1-5]次?/g, "")           // Remove ordinal numbers (Japanese and Arabic)
    .toLowerCase();
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Find existing deadline that matches the given criteria
 */
async function findExistingDeadline(
  companyId: string,
  type: DeadlineType,
  title: string,
  dueDate: Date | null
): Promise<typeof deadlines.$inferSelect | null> {
  if (!dueDate) return null;

  // Find deadlines with same type for this company
  const existingDeadlines = await db
    .select()
    .from(deadlines)
    .where(
      and(
        eq(deadlines.companyId, companyId),
        eq(deadlines.type, type)
      )
    );

  const normalizedNewTitle = normalizeTitle(title);

  for (const existing of existingDeadlines) {
    // Check if title is similar (after normalization)
    const normalizedExistingTitle = normalizeTitle(existing.title);

    if (normalizedExistingTitle === normalizedNewTitle) {
      // Check if dates are same day
      if (existing.dueDate && isSameDay(existing.dueDate, dueDate)) {
        return existing;
      }
    }
  }

  return null;
}

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
    const identity = await getIdentity(request);
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

    // Verify company access
    const access = await verifyCompanyAccess(companyId, userId, guestId);
    if (!access.valid || !access.company) {
      return createApiErrorResponse(request, {
        status: 404,
        code: "COMPANY_NOT_FOUND",
        userMessage: "企業が見つかりません。",
        action: "一覧から企業を選び直してください。",
      });
    }

    const company = access.company;

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

    // Check credits/quota（ログインユーザー: 月次無料枠 → 超過は 1 クレジット）
    let useMonthlyScheduleFree = false;
    if (userId) {
      const freeRemaining = await getRemainingFreeFetches(userId, null, plan);
      if (freeRemaining > 0) {
        useMonthlyScheduleFree = true;
      } else {
        const hasCredits = await hasEnoughCredits(userId, 1);
        if (!hasCredits) {
          return createApiErrorResponse(request, {
            status: 402,
            code: "INSUFFICIENT_CREDITS",
            userMessage: "クレジットが不足しています。",
            action: "プランまたは残高を確認してください。",
          });
        }
      }
    } else if (guestId) {
      const freeRemaining = await getRemainingFreeFetches(null, guestId, plan);
      if (freeRemaining <= 0) {
        return createApiErrorResponse(request, {
          status: 402,
          code: "MONTHLY_SCHEDULE_FREE_LIMIT_REACHED",
          userMessage: `今月の無料取得回数を使い切りました。ログインすると月${getMonthlyScheduleFetchFreeLimit("free")}回まで利用できます。`,
          action: "来月以降に再試行するか、ログインして利用してください。",
        });
      }
      useMonthlyScheduleFree = true;
    }

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
      // Update company's recruitmentUrl and infoFetchedAt
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

    // 締切あり = 完全成功: Save extracted deadlines
    const savedDeadlines: string[] = [];
    const skippedDuplicates: string[] = [];
    const savedDeadlineSummaries: Array<{
      id: string;
      title: string;
      type: string;
      dueDate: string;
      sourceUrl: string | null;
      isDuplicate?: boolean;
    }> = [];
    if (fetchResult.data?.deadlines && fetchResult.data.deadlines.length > 0) {
      const now = new Date();

      for (const d of fetchResult.data.deadlines) {
        // Map type to valid enum value
        const validTypes: DeadlineType[] = [
          "es_submission", "web_test", "aptitude_test",
          "interview_1", "interview_2", "interview_3", "interview_final",
          "briefing", "internship", "offer_response", "other"
        ];
        const type: DeadlineType = validTypes.includes(d.type as DeadlineType)
          ? (d.type as DeadlineType)
          : "other";

        let dueDate: Date | null = null;
        // Backend uses snake_case: due_date
        const rawDueDate = d.due_date || d.dueDate;
        if (rawDueDate) {
          try {
            dueDate = new Date(rawDueDate);
            if (isNaN(dueDate.getTime())) {
              dueDate = null;
            }
          } catch {
            dueDate = null;
          }
        }

        // Skip if no due date (set a far future placeholder)
        if (!dueDate) {
          dueDate = new Date(now.getFullYear() + 1, 11, 31); // Dec 31 next year as placeholder
        }

        // Check for duplicate deadline (same type, similar title, same day)
        const existingDeadline = await findExistingDeadline(
          companyId,
          type,
          d.title,
          dueDate
        );

        if (existingDeadline) {
          // Skip duplicate, but track it
          console.log(`Skipping duplicate deadline: ${d.title} (${dueDate?.toISOString()})`);
          skippedDuplicates.push(existingDeadline.id);
          savedDeadlineSummaries.push({
            id: existingDeadline.id,
            title: existingDeadline.title,
            type: existingDeadline.type,
            dueDate: existingDeadline.dueDate?.toISOString() || dueDate.toISOString(),
            sourceUrl: existingDeadline.sourceUrl,
            isDuplicate: true,
          });
          continue;
        }

        const newDeadline = await db
          .insert(deadlines)
          .values({
            id: crypto.randomUUID(),
            companyId,
            type,
            title: d.title,
            description: null,
            memo: null,
            dueDate,
            isConfirmed: false, // AI-extracted deadlines need confirmation
            confidence: (d.confidence as "high" | "medium" | "low") || "low",
            sourceUrl: d.source_url || urlToFetch,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        savedDeadlines.push(newDeadline[0].id);
        savedDeadlineSummaries.push({
          id: newDeadline[0].id,
          title: newDeadline[0].title,
          type: newDeadline[0].type,
          dueDate: newDeadline[0].dueDate?.toISOString() || dueDate.toISOString(),
          sourceUrl: newDeadline[0].sourceUrl,
        });
      }
    }

    const deadlinesSavedCount = savedDeadlines.length;
    const duplicatesOnly = deadlinesExtractedCount > 0 && deadlinesSavedCount === 0 && skippedDuplicates.length > 0;

    // Update company's recruitmentUrl and infoFetchedAt
    await db
      .update(companies)
      .set({
        recruitmentUrl: urlToFetch,
        infoFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Success: Consume credits/quota
    let creditsConsumed = 0;
    let actualCreditsDeducted: number | undefined;
    if (useMonthlyScheduleFree) {
      if (userId) {
        await incrementMonthlyScheduleFreeUse(userId);
      }
    } else if (userId) {
      const consumption = await consumeCredits(
        userId,
        1,
        "company_fetch",
        companyId,
        `選考スケジュール取得: ${company.name}`,
      );
      if (!consumption.success) {
        throw new Error("Insufficient credits for company info usage");
      }
      creditsConsumed = 1;
      actualCreditsDeducted = 1;
    }

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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
