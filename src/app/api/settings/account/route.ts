/**
 * Account Deletion API
 *
 * DELETE: Delete user account and all related data (irreversible)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { logError } from "@/lib/logger";

export async function DELETE(request: NextRequest) {
  try {
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

    // Audit log: account deletion initiated
    console.info(JSON.stringify({
      event: "account_deletion_initiated",
      userId,
      timestamp: new Date().toISOString(),
    }));

    // Check if user has an active Stripe subscription
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (sub?.stripeSubscriptionId && sub.status !== "canceled") {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        console.info(JSON.stringify({
          event: "stripe_subscription_canceled",
          userId,
          subscriptionId: sub.stripeSubscriptionId,
        }));
      } catch (e) {
        logError("cancel-stripe-subscription", e as Error, { userId });
        // Continue with account deletion even if Stripe cancellation fails
      }
    }

    // Delete user - CASCADE will handle all related data automatically
    // All tables with foreign keys to users have onDelete: "cascade" configured
    await db.delete(users).where(eq(users.id, userId));

    // Audit log: account deletion completed
    console.info(JSON.stringify({
      event: "account_deletion_completed",
      userId,
      timestamp: new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    logError("delete-account", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
