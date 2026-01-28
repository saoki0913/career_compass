/**
 * Credits API
 *
 * GET: Get current credit balance, next reset date, and daily free usage
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getCreditsInfo,
  getRemainingFreeFetches,
  PLAN_CREDITS,
  DAILY_FREE_COMPANY_FETCH,
} from "@/lib/credits";
import { getGuestUser } from "@/lib/auth/guest";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    // Try authenticated session first
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session?.user?.id) {
      const userId = session.user.id;

      // Get user's plan
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .get();

      const plan = (profile?.plan || "free") as "free" | "standard" | "pro";

      // Get credits info (this will initialize if needed)
      const creditsInfo = await getCreditsInfo(userId);

      // Get remaining free fetches
      const remainingFreeFetches = await getRemainingFreeFetches(userId, null);

      return NextResponse.json({
        type: "user",
        plan,
        balance: creditsInfo.balance,
        monthlyAllocation: creditsInfo.monthlyAllocation,
        nextResetAt: creditsInfo.nextResetAt.toISOString(),
        dailyFree: {
          companyFetch: {
            remaining: remainingFreeFetches,
            limit: DAILY_FREE_COMPANY_FETCH.user,
          },
        },
      });
    }

    // Try guest token
    const deviceToken = request.headers.get("x-device-token");
    if (deviceToken) {
      const guest = await getGuestUser(deviceToken);
      if (guest) {
        // Get remaining free fetches for guest
        const remainingFreeFetches = await getRemainingFreeFetches(null, guest.id);

        return NextResponse.json({
          type: "guest",
          plan: "guest",
          balance: PLAN_CREDITS.guest, // Guests have a fixed allocation
          monthlyAllocation: PLAN_CREDITS.guest,
          nextResetAt: null, // Guests don't have monthly reset
          dailyFree: {
            companyFetch: {
              remaining: remainingFreeFetches,
              limit: DAILY_FREE_COMPANY_FETCH.guest,
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
