/**
 * Stripe Customer Portal API
 *
 * POST: Create a billing portal session for subscription management
 */

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    // Get user's subscription
    const subscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .get();

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "アクティブなサブスクリプションがありません" },
        { status: 400 }
      );
    }

    // Create billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return NextResponse.json(
      { error: "請求ポータルの作成に失敗しました" },
      { status: 500 }
    );
  }
}
