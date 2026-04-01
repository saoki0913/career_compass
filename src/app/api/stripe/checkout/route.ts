/**
 * Stripe Checkout Session API
 *
 * POST: Create a checkout session for subscription
 * Body: { plan: "standard" | "pro", period?: "monthly" | "annual" }
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPriceId, type PlanType, type BillingPeriod } from "@/lib/stripe/config";
import { getAppUrl } from "@/lib/app-url";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { logError } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const appUrl = getAppUrl();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return createApiErrorResponse(req, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Authentication required",
      });
    }

    const body = await req.json();
    const plan = body.plan as PlanType;
    const period = (body.period || "monthly") as BillingPeriod;

    // Validate plan
    if (!plan || !["standard", "pro"].includes(plan)) {
      return createApiErrorResponse(req, {
        status: 400,
        code: "STRIPE_CHECKOUT_INVALID_PLAN",
        userMessage: "プランの選択内容を確認してください。",
        developerMessage: "Invalid plan selection",
      });
    }

    // Get price ID
    const priceId = getPriceId(plan, period);
    if (!priceId) {
      return createApiErrorResponse(req, {
        status: 500,
        code: "STRIPE_CHECKOUT_PRICE_NOT_FOUND",
        userMessage: "プラン変更を開始できませんでした。",
        action: "時間をおいて、もう一度お試しください。",
        developerMessage: "Price ID not found for checkout",
      });
    }

    // Get or create Stripe customer
    let stripeCustomerId: string | undefined;

    // Check if user already has a subscription with customer ID
    const [existingSubscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);

    if (existingSubscription?.stripeCustomerId) {
      stripeCustomerId = existingSubscription.stripeCustomerId;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: {
          userId: session.user.id,
        },
      });
      stripeCustomerId = customer.id;
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?success=true&plan=${plan}`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      metadata: {
        userId: session.user.id,
        plan: plan,
        period: period,
      },
      subscription_data: {
        metadata: {
          userId: session.user.id,
          plan: plan,
        },
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address collection
      billing_address_collection: "auto",
    });

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    logError("stripe-checkout", error);
    return createApiErrorResponse(req, {
      status: 500,
      code: "STRIPE_CHECKOUT_CREATE_FAILED",
      userMessage: "プラン変更を開始できませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to create Stripe checkout session",
      error,
    });
  }
}
