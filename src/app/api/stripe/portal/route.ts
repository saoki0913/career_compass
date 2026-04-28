/**
 * Stripe Customer Portal API
 *
 * POST: Create a billing portal session for subscription management
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAppUrl } from "@/lib/app-url";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { logError } from "@/lib/logger";
import { getCsrfFailureReason } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  try {
    const csrfFailure = getCsrfFailureReason(request);
    if (csrfFailure) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "CSRF_VALIDATION_FAILED",
        userMessage: "安全確認に失敗しました。ページを再読み込みして、もう一度お試しください。",
        developerMessage: `CSRF validation failed: ${csrfFailure}`,
      });
    }

    const appUrl = getAppUrl();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return createApiErrorResponse(request, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Authentication required",
      });
    }

    // Get user's subscription
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);

    if (!subscription?.stripeCustomerId) {
      return createApiErrorResponse(request, {
        status: 400,
        code: "STRIPE_PORTAL_SUBSCRIPTION_REQUIRED",
        userMessage: "請求管理ページを開けませんでした。",
        action: "利用中のプラン状況を確認してください。",
        developerMessage: "No active subscription for billing portal",
      });
    }

    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    logError("stripe-portal", error);
    return createApiErrorResponse(request, {
      status: 500,
      code: "STRIPE_PORTAL_CREATE_FAILED",
      userMessage: "請求管理ページを開けませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to create Stripe billing portal session",
      error,
    });
  }
}
