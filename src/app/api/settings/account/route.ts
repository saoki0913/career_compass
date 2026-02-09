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

    // Check if user has an active Stripe subscription
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (sub?.stripeSubscriptionId && sub.status !== "canceled") {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
        console.log(`Stripe subscription ${sub.stripeSubscriptionId} canceled`);
      } catch (e) {
        console.error("Error canceling Stripe subscription:", e);
        // Continue with account deletion even if Stripe cancellation fails
      }
    }

    // Delete user - CASCADE will handle all related data automatically
    // All tables with foreign keys to users have onDelete: "cascade" configured
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
