/**
 * Selection Schedule Fetch API
 *
 * POST: Fetch selection schedule information from recruitment URL
 * - Validates user/guest authentication
 * - Checks credits/daily free quota
 * - Calls FastAPI backend
 * - Saves extracted deadlines on success
 * - Consumes credits only on success
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { companies, deadlines, userProfiles } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";
import { getGuestUser } from "@/lib/auth/guest";
import {
  getRemainingFreeFetches,
  incrementDailyFreeUsage,
  consumeCredits,
  hasEnoughCredits,
  consumePartialCredits,
} from "@/lib/credits";
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// FastAPI backend URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/**
 * Validate URL to prevent SSRF attacks
 * - Only allows HTTPS
 * - Blocks localhost, private IPs, and link-local addresses
 */
function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "HTTPSのみ許可されています" };
    }

    // Block private/internal addresses
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return { valid: false, error: "内部アドレスは許可されていません" };
    }

    // Block IPv6 addresses entirely (corporate sites use domain names)
    if (hostname.includes(":") || hostname.startsWith("[")) {
      return { valid: false, error: "IPv6アドレスは許可されていません" };
    }

    // Block private IP ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      // 10.0.0.0/8
      if (a === 10) {
        return { valid: false, error: "内部アドレスは許可されていません" };
      }
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) {
        return { valid: false, error: "内部アドレスは許可されていません" };
      }
      // 192.168.0.0/16
      if (a === 192 && b === 168) {
        return { valid: false, error: "内部アドレスは許可されていません" };
      }
      // 169.254.0.0/16 (link-local, AWS metadata)
      if (a === 169 && b === 254) {
        return { valid: false, error: "内部アドレスは許可されていません" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "無効なURLです" };
  }
}

interface ExtractedDeadline {
  type: string;
  title: string;
  due_date: string | null;  // Backend uses snake_case
  dueDate?: string | null;  // Frontend alias
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
  // NEW: Raw text for full-text RAG storage
  raw_text?: string | null;
  // NEW: Raw HTML for section-aware chunking
  raw_html?: string | null;
}

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
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .get();

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

  const company = await db.select().from(companies).where(whereClause).get();

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
  type: string,
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
        eq(deadlines.type, type as any)
      )
    )
    .all();

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

    // Get URL and optional parameters from request body
    const body = await request.json().catch(() => ({}));
    const requestUrl = body.url as string | undefined;
    const selectionType = body.selectionType as "main_selection" | "internship" | undefined;
    const graduationYear = body.graduationYear as number | undefined;

    // Get identity
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId, plan } = identity;

    // Rate limiting check
    const rateLimitKey = createRateLimitKey("fetchInfo", userId, guestId);
    const rateLimit = await checkRateLimit(rateLimitKey, RATE_LIMITS.fetchInfo);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく待ってから再試行してください。" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.resetIn),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    // Verify company access
    const access = await verifyCompanyAccess(companyId, userId, guestId);
    if (!access.valid || !access.company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const company = access.company;

    // Use provided URL or fall back to company's recruitment URL
    const urlToFetch = requestUrl || company.recruitmentUrl;
    if (!urlToFetch) {
      return NextResponse.json(
        { error: "採用ページURLが登録されていません。URLを選択してください。" },
        { status: 400 }
      );
    }

    // SSRF protection: Validate URL before fetching
    const urlValidation = validateUrl(urlToFetch);
    if (!urlValidation.valid) {
      return NextResponse.json(
        { error: urlValidation.error || "無効なURLです" },
        { status: 400 }
      );
    }

    // Check credits/quota (for registered users only)
    let useDailyFree = false;
    if (userId) {
      const freeRemaining = await getRemainingFreeFetches(userId, null);
      if (freeRemaining > 0) {
        useDailyFree = true;
      } else {
        const hasCredits = await hasEnoughCredits(userId, 1);
        if (!hasCredits) {
          return NextResponse.json(
            { error: "クレジットが不足しています" },
            { status: 402 }
          );
        }
      }
    } else if (guestId) {
      const freeRemaining = await getRemainingFreeFetches(null, guestId);
      if (freeRemaining <= 0) {
        return NextResponse.json(
          { error: "本日の無料取得回数を使い切りました。ログインするとより多くの回数が利用できます。" },
          { status: 402 }
        );
      }
      useDailyFree = true;
    }

    // Get user's graduation year from profile if not provided in request
    let effectiveGraduationYear = graduationYear;
    if (!effectiveGraduationYear && userId) {
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .get();
      effectiveGraduationYear = profile?.graduationYear || undefined;
    }

    // Call FastAPI backend with graduation year and selection type
    let fetchResult: FetchResult;
    try {
      const response = await fetch(`${BACKEND_URL}/company-info/fetch-schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: urlToFetch,
          graduation_year: effectiveGraduationYear,
          selection_type: selectionType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle error detail that might be an object
        let errorMessage = "Backend request failed";
        if (errorData.detail) {
          if (typeof errorData.detail === "string") {
            errorMessage = errorData.detail;
          } else if (errorData.detail.message) {
            errorMessage = errorData.detail.message;
          } else if (errorData.detail.error) {
            errorMessage = errorData.detail.error;
          } else {
            errorMessage = JSON.stringify(errorData.detail);
          }
        }
        throw new Error(errorMessage);
      }

      fetchResult = await response.json();
    } catch (error) {
      logError("backend-fetch", error);
      return NextResponse.json(
        { error: "情報の取得に失敗しました。しばらく後にお試しください。" },
        { status: 503 }
      );
    }

    // Handle failure
    if (!fetchResult.success) {
      return NextResponse.json({
        success: false,
        error: fetchResult.error || "情報を抽出できませんでした",
        creditsConsumed: 0,
      });
    }

    const rawContent = fetchResult.raw_html || fetchResult.raw_text || null;
    const rawContentFormat = fetchResult.raw_html ? "html" : "text";

    // 成功判定の細分化（SPEC.md 4.2）
    const hasDeadlines = fetchResult.data?.deadlines && fetchResult.data.deadlines.length > 0;
    const hasOtherData = fetchResult.data?.application_method ||
                         (fetchResult.data?.required_documents && fetchResult.data.required_documents.length > 0) ||
                         fetchResult.data?.selection_process;

    // 締切なし & 他データあり = 部分成功（0.5クレジット消費）
    if (!hasDeadlines && hasOtherData && userId && !useDailyFree) {
      const partialResult = await consumePartialCredits(
        userId,
        "company_fetch",
        companyId,
        `選考スケジュール取得（部分成功）: ${company.name}`
      );

      // Update company's recruitmentUrl and infoFetchedAt
      await db
        .update(companies)
        .set({
          recruitmentUrl: urlToFetch,
          infoFetchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));

      // Build RAG for partial success (still has valuable data)
      try {
        await fetch(`${BACKEND_URL}/company-info/rag/build`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            company_name: company.name,
            source_url: urlToFetch,
            // Include raw text for full-text indexing
            raw_content: rawContent,
            raw_content_format: rawContentFormat,
            store_full_text: true,
            content_channel: "recruitment",
            extracted_data: {
              deadlines: [],
              recruitment_types: fetchResult.data?.recruitment_types || [],
              required_documents: fetchResult.data?.required_documents || [],
              application_method: fetchResult.data?.application_method || null,
              selection_process: fetchResult.data?.selection_process || null,
            },
          }),
        });
        console.log(`RAG build initiated for company ${companyId} (partial success)`);
      } catch (ragError) {
        logError("rag-build-partial", ragError);
      }

      const freeRemaining = await getRemainingFreeFetches(userId, guestId);

      return NextResponse.json({
        success: true,
        partial: true,
        data: {
          deadlinesCount: 0,
          deadlineIds: [],
          applicationMethod: fetchResult.data?.application_method?.value || null,
          requiredDocuments: fetchResult.data?.required_documents?.map(d => d.name) || [],
          selectionProcess: fetchResult.data?.selection_process?.value || null,
        },
        deadlines: [],
        creditsConsumed: 0.5,
        actualCreditsDeducted: partialResult.actualConsumed,
        freeUsed: false,
        freeRemaining,
        message: "締切情報は見つかりませんでしたが、他の情報を取得しました（0.5クレジット消費）",
      });
    }

    // 締切なし & 他データもなし = 完全失敗（クレジット消費なし）
    if (!hasDeadlines && !hasOtherData) {
      return NextResponse.json({
        success: false,
        error: "情報を抽出できませんでした",
        creditsConsumed: 0,
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
        const validTypes = [
          "es_submission", "web_test", "aptitude_test",
          "interview_1", "interview_2", "interview_3", "interview_final",
          "briefing", "internship", "offer_response", "other"
        ];
        const type = validTypes.includes(d.type) ? d.type : "other";

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
            type: type as any,
            title: d.title,
            description: null,
            memo: null,
            dueDate,
            isConfirmed: false, // AI-extracted deadlines need confirmation
            confidence: (d.confidence as "high" | "medium" | "low") || "low",
            sourceUrl: urlToFetch,
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

    // Update company's recruitmentUrl and infoFetchedAt
    await db
      .update(companies)
      .set({
        recruitmentUrl: urlToFetch,
        infoFetchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    // Build RAG (vector embeddings) for this company
    // This is async and non-blocking - we don't wait for it or fail if it errors
    // Now includes full text storage for enhanced RAG
    try {
      await fetch(`${BACKEND_URL}/company-info/rag/build`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: companyId,
          company_name: company.name,
          source_url: urlToFetch,
          // Include raw text for full-text indexing
          raw_content: rawContent,
          raw_content_format: rawContentFormat,
          store_full_text: true,
          content_channel: "recruitment",
          extracted_data: {
            deadlines: fetchResult.data?.deadlines?.map((d: ExtractedDeadline) => ({
              type: d.type,
              title: d.title,
              due_date: d.due_date || d.dueDate,
              confidence: d.confidence,
            })) || [],
            recruitment_types: fetchResult.data?.recruitment_types || [],
            required_documents: fetchResult.data?.required_documents || [],
            application_method: fetchResult.data?.application_method || null,
            selection_process: fetchResult.data?.selection_process || null,
          },
        }),
      });
      console.log(`RAG build initiated for company ${companyId} (full text + structured)`);
    } catch (ragError) {
      // RAG build failure should not fail the overall operation
      logError("rag-build-full", ragError);
    }

    // Success: Consume credits/quota
    let creditsConsumed = 0;
    if (useDailyFree) {
      await incrementDailyFreeUsage(userId, guestId, "companyFetchCount");
    } else if (userId) {
      await consumeCredits(userId, 1, "company_fetch", companyId, `選考スケジュール取得: ${company.name}`);
      creditsConsumed = 1;
    }

    // Get updated free remaining
    const freeRemaining = await getRemainingFreeFetches(userId, guestId);

    return NextResponse.json({
      success: true,
      data: {
        deadlinesCount: savedDeadlines.length,
        deadlineIds: savedDeadlines,
        duplicatesSkipped: skippedDuplicates.length,
        duplicateIds: skippedDuplicates,
        applicationMethod: fetchResult.data?.application_method?.value || null,
        requiredDocuments: fetchResult.data?.required_documents?.map(d => d.name) || [],
        selectionProcess: fetchResult.data?.selection_process?.value || null,
      },
      deadlines: savedDeadlineSummaries,
      creditsConsumed,
      freeUsed: useDailyFree,
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
