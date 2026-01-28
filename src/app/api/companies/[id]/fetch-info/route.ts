/**
 * Company Info Fetch API
 *
 * POST: Fetch company information from recruitment URL
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

// FastAPI backend URL
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

interface ExtractedDeadline {
  type: string;
  title: string;
  dueDate: string | null;
  confidence: string;
}

interface FetchResult {
  success: boolean;
  data?: {
    deadlines: ExtractedDeadline[];
    applicationMethod: string | null;
    requiredDocuments: string[];
    selectionProcess: string | null;
  };
  sourceUrl: string;
  extractedAt: string;
  error?: string;
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await params;

    // Get URL from request body (optional - falls back to company.recruitmentUrl)
    const body = await request.json().catch(() => ({}));
    const requestUrl = body.url as string | undefined;

    // Get identity
    const identity = await getIdentity(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { userId, guestId, plan } = identity;

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

    // Call FastAPI backend
    let fetchResult: FetchResult;
    try {
      const response = await fetch(`${BACKEND_URL}/company-info/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: urlToFetch,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Backend request failed");
      }

      fetchResult = await response.json();
    } catch (error) {
      console.error("Backend fetch error:", error);
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

    // 成功判定の細分化（SPEC.md 4.2）
    const hasDeadlines = fetchResult.data?.deadlines && fetchResult.data.deadlines.length > 0;
    const hasOtherData = fetchResult.data?.applicationMethod ||
                         (fetchResult.data?.requiredDocuments && fetchResult.data.requiredDocuments.length > 0) ||
                         fetchResult.data?.selectionProcess;

    // 締切なし & 他データあり = 部分成功（0.5クレジット消費）
    if (!hasDeadlines && hasOtherData && userId && !useDailyFree) {
      const partialResult = await consumePartialCredits(
        userId,
        "company_fetch",
        companyId,
        `企業情報取得（部分成功）: ${company.name}`
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

      const freeRemaining = await getRemainingFreeFetches(userId, guestId);

      return NextResponse.json({
        success: true,
        partial: true,
        data: {
          deadlinesCount: 0,
          deadlineIds: [],
          applicationMethod: fetchResult.data?.applicationMethod || null,
          requiredDocuments: fetchResult.data?.requiredDocuments || [],
          selectionProcess: fetchResult.data?.selectionProcess || null,
        },
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
        if (d.dueDate) {
          try {
            dueDate = new Date(d.dueDate);
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

    // Success: Consume credits/quota
    let creditsConsumed = 0;
    if (useDailyFree) {
      await incrementDailyFreeUsage(userId, guestId, "companyFetchCount");
    } else if (userId) {
      await consumeCredits(userId, 1, "company_fetch", companyId, `企業情報取得: ${company.name}`);
      creditsConsumed = 1;
    }

    // Get updated free remaining
    const freeRemaining = await getRemainingFreeFetches(userId, guestId);

    return NextResponse.json({
      success: true,
      data: {
        deadlinesCount: savedDeadlines.length,
        deadlineIds: savedDeadlines,
        applicationMethod: fetchResult.data?.applicationMethod || null,
        requiredDocuments: fetchResult.data?.requiredDocuments || [],
        selectionProcess: fetchResult.data?.selectionProcess || null,
      },
      creditsConsumed,
      freeUsed: useDailyFree,
      freeRemaining,
    });
  } catch (error) {
    console.error("Error fetching company info:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
