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

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await req.json();
    const plan = body.plan as PlanType;
    const period = (body.period || "monthly") as BillingPeriod;

    // Validate plan
    if (!plan || !["standard", "pro"].includes(plan)) {
      return NextResponse.json(
        { error: "有効なプランを指定してください" },
        { status: 400 }
      );
    }

    // Get price ID
    const priceId = getPriceId(plan, period);
    if (!priceId) {
      return NextResponse.json(
        { error: "価格設定が見つかりません。管理者にお問い合わせください。" },
        { status: 500 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId: string | undefined;

    // Check if user already has a subscription with customer ID
    const existingSubscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .get();

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
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true&plan=${plan}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
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
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "チェックアウトセッションの作成に失敗しました" },
      { status: 500 }
    );
  }
}
