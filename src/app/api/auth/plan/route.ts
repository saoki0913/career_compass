/**
 * Plan API
 *
 * GET: Get user's current plan
 *
 * NOTE: POST handler was removed in security hotfix S-1 (C-1).
 * Plan changes MUST go through Stripe subscription webhooks.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function GET() {
  try {
    // Get the authenticated user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      // Default to Free on first login.
      // We intentionally do NOT gate the product behind plan selection.
      const now = new Date();
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        userId,
        plan: "free",
        planSelectedAt: now,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
      });

      return NextResponse.json({
        plan: "free",
        planSelectedAt: now.toISOString(),
        onboardingCompleted: false,
        needsPlanSelection: false,
        needsOnboarding: true,
      });
    }

    // Backfill: older users may have planSelectedAt = null due to previous
    // "select a plan before continuing" flow. We now default to Free.
    if (!profile.planSelectedAt) {
      const now = new Date();
      await db
        .update(userProfiles)
        .set({
          planSelectedAt: now,
          updatedAt: now,
        })
        .where(eq(userProfiles.userId, userId));

      return NextResponse.json({
        plan: profile.plan,
        planSelectedAt: now.toISOString(),
        onboardingCompleted: profile.onboardingCompleted,
        needsPlanSelection: false,
        needsOnboarding: !profile.onboardingCompleted,
      });
    }

    return NextResponse.json({
      plan: profile.plan,
      planSelectedAt: profile.planSelectedAt?.toISOString() || null,
      onboardingCompleted: profile.onboardingCompleted,
      needsPlanSelection: false,
      needsOnboarding: !profile.onboardingCompleted,
    });
  } catch (error) {
    console.error("Error getting plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
