/**
 * Plan Selection API
 *
 * POST: Select a plan for the user
 * GET: Get user's current plan
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

type PlanType = "free" | "standard" | "pro";

const VALID_PLANS: PlanType[] = ["free", "standard", "pro"];

export async function POST(request: NextRequest) {
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

    const { plan } = await request.json();

    if (!plan || !VALID_PLANS.includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan. Must be one of: free, standard, pro" },
        { status: 400 }
      );
    }

    const userId = session.user.id;

    // Check if profile exists
    const [existingProfile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const now = new Date();

    if (existingProfile) {
      // Update existing profile
      await db
        .update(userProfiles)
        .set({
          plan: plan as PlanType,
          planSelectedAt: now,
          updatedAt: now,
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      // Create new profile
      await db.insert(userProfiles).values({
        id: crypto.randomUUID(),
        userId,
        plan: plan as PlanType,
        planSelectedAt: now,
        onboardingCompleted: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      plan,
      message: `Plan set to ${plan}`,
    });
  } catch (error) {
    console.error("Error setting plan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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
