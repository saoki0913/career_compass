/**
 * Account Deletion API
 *
 * DELETE: Delete user account and all related data (irreversible)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { logError } from "@/lib/logger";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { revokeAndClearGoogleCalendarConnection } from "@/lib/calendar/connection";
import { revokeGoogleAccountTokens } from "@/lib/auth/google-account-tokens";
import { requireUserMutationRequest } from "@/bff/api/mutation-guard";

export async function DELETE(request: NextRequest) {
  try {
    const mutationGuard = await requireUserMutationRequest(request);
    if (!mutationGuard.ok) {
      return mutationGuard.response;
    }

    const userId = mutationGuard.session.user.id;

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
        return createApiErrorResponse(request, {
          status: 502,
          code: "STRIPE_CANCEL_FAILED",
          userMessage: "サブスクリプションの解約に失敗しました。再度お試しいただくか、サポートにお問い合わせください。",
          action: "retry",
        });
      }
    }

    try {
      await revokeGoogleAccountTokens(userId);
      await revokeAndClearGoogleCalendarConnection(userId);
    } catch (e) {
      logError("revoke-google-calendar-connection", e as Error, { userId });
      return createApiErrorResponse(request, {
        status: 502,
        code: "GOOGLE_CALENDAR_REVOKE_FAILED",
        userMessage: "Google カレンダー連携の解除に失敗しました。再度お試しいただくか、サポートにお問い合わせください。",
        action: "retry",
      });
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
    return createApiErrorResponse(request, {
      status: 500,
      code: "SETTINGS_ACCOUNT_DELETE_FAILED",
      userMessage: "アカウントを削除できませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to delete account",
      error,
    });
  }
}
