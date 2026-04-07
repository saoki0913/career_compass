/**
 * Credits API
 *
 * GET: Get current credit balance, next reset date, and free quotas (monthly schedule + RAG pages)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getCreditsInfo,
  getRemainingFreeFetches,
  PLAN_CREDITS,
} from "@/lib/credits";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getMonthlyScheduleFetchFreeLimit,
  getMonthlyRagHtmlFreeUnits,
  getMonthlyRagPdfFreeUnits,
} from "@/lib/company-info/pricing";
import {
  getRagPdfIngestPolicySummaryJa,
  getRagPdfMaxIngestPages,
  getRagPdfMaxGoogleOcrPages,
  getRagPdfMaxMistralOcrPages,
} from "@/lib/company-info/pdf-ingest-limits";
import {
  getRemainingCompanyRagHtmlFreeUnitsSafe,
  getRemainingCompanyRagPdfFreeUnitsSafe,
} from "@/lib/company-info/usage";

export async function GET(request: NextRequest) {
  try {
    // Try authenticated session first
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session?.user?.id) {
      const userId = session.user.id;

      // Get user's plan
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      const plan = (profile?.plan || "free") as "free" | "standard" | "pro";

      // Get credits info (this will initialize if needed)
      const creditsInfo = await getCreditsInfo(userId);

      // Get remaining free fetches
      const remainingFreeFetches = await getRemainingFreeFetches(userId, null, plan);
      const [remainingRagHtmlFreeUnits, remainingRagPdfFreeUnits] = await Promise.all([
        getRemainingCompanyRagHtmlFreeUnitsSafe(userId, plan),
        getRemainingCompanyRagPdfFreeUnitsSafe(userId, plan),
      ]);

      return NextResponse.json({
        type: "user",
        plan,
        balance: creditsInfo.balance,
        monthlyAllocation: creditsInfo.monthlyAllocation,
        nextResetAt: creditsInfo.nextResetAt.toISOString(),
        monthlyFree: {
          companyRagHtmlPages: {
            remaining: remainingRagHtmlFreeUnits,
            limit: getMonthlyRagHtmlFreeUnits(plan),
          },
          companyRagPdfPages: {
            remaining: remainingRagPdfFreeUnits,
            limit: getMonthlyRagPdfFreeUnits(plan),
          },
          selectionSchedule: {
            remaining: remainingFreeFetches,
            limit: getMonthlyScheduleFetchFreeLimit(plan),
          },
        },
        ragPdfLimits: {
          maxPagesIngest: getRagPdfMaxIngestPages(plan),
          maxPagesGoogleOcr: getRagPdfMaxGoogleOcrPages(plan),
          maxPagesMistralOcr: getRagPdfMaxMistralOcrPages(plan),
          summaryJa: getRagPdfIngestPolicySummaryJa(plan),
        },
      });
    }

    // Try guest token
    const deviceToken = request.headers.get("x-device-token");
    if (deviceToken) {
      const guest = await getGuestUser(deviceToken);
      if (guest) {
        // Get remaining free fetches for guest
        const remainingFreeFetches = await getRemainingFreeFetches(null, guest.id, "guest");

        return NextResponse.json({
          type: "guest",
          plan: "guest",
          balance: PLAN_CREDITS.guest, // Guests have a fixed allocation
          monthlyAllocation: PLAN_CREDITS.guest,
          nextResetAt: null, // Guests don't have monthly reset
          monthlyFree: {
            companyRagHtmlPages: {
              remaining: 0,
              limit: 0,
            },
            companyRagPdfPages: {
              remaining: 0,
              limit: 0,
            },
            selectionSchedule: {
              remaining: remainingFreeFetches,
              limit: getMonthlyScheduleFetchFreeLimit("guest"),
            },
          },
        });
      }
    }

    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Error getting credits:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
