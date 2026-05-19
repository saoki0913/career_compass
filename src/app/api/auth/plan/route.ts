/**
 * Plan API
 *
 * GET: Get user's current plan
 *
 * NOTE: POST handler was removed in security hotfix S-1 (C-1).
 * Plan changes MUST go through Stripe subscription webhooks.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { subscriptions, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { isActiveSubscriptionStatus } from "@/lib/billing/subscription-status";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { normalizeUserPlanName, type UserPlanResponse } from "@/lib/auth/plan-types";

type SubscriptionPlanState = {
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
};

async function querySubscriptionPlanState(userId: string): Promise<SubscriptionPlanState> {
  const [sub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return {
    hasActiveSubscription: isActiveSubscriptionStatus(sub?.status),
    subscriptionStatus: sub?.status ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get the authenticated user session
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        action: "ログインし直してください。",
        developerMessage: "Authentication required",
      });
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

      const responseBody: UserPlanResponse = {
        plan: "free",
        planSelectedAt: now.toISOString(),
        onboardingCompleted: false,
        needsPlanSelection: false,
        needsOnboarding: true,
        hasActiveSubscription: false,
        subscriptionStatus: null,
      };
      return NextResponse.json(responseBody);
    }

    const subscriptionPlanState = await querySubscriptionPlanState(userId);

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

      const responseBody: UserPlanResponse = {
        plan: normalizeUserPlanName(profile.plan),
        planSelectedAt: now.toISOString(),
        onboardingCompleted: profile.onboardingCompleted,
        needsPlanSelection: false,
        needsOnboarding: !profile.onboardingCompleted,
        ...subscriptionPlanState,
      };
      return NextResponse.json(responseBody);
    }

    const responseBody: UserPlanResponse = {
      plan: normalizeUserPlanName(profile.plan),
      planSelectedAt: profile.planSelectedAt?.toISOString() || null,
      onboardingCompleted: profile.onboardingCompleted,
      needsPlanSelection: false,
      needsOnboarding: !profile.onboardingCompleted,
      ...subscriptionPlanState,
    };
    return NextResponse.json(responseBody);
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "AUTH_PLAN_FETCH_FAILED",
      userMessage: "プラン情報を読み込めませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      retryable: true,
      developerMessage: "Failed to get plan",
      error,
      logContext: "auth-plan",
    });
  }
}
