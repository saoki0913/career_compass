/**
 * Stripe Customer Portal API
 *
 * POST: Create a billing portal session for subscription management
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAppUrl } from "@/lib/app-url";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { requireUserMutationRequest } from "@/bff/api/mutation-guard";
import { resolveAppEnvironment } from "@/env/deployment";
import { getPortalConfigurationId } from "@/lib/stripe/config";

function isProductionDeployment() {
  return resolveAppEnvironment() === "production";
}

function getStripeCustomerId(
  value: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireUserMutationRequest(request);
    if (!guard.ok) return guard.response;

    const appUrl = getAppUrl();
    const { session } = guard;
    const portalConfigurationId = getPortalConfigurationId();

    if (isProductionDeployment() && !portalConfigurationId) {
      return createApiErrorResponse(request, {
        status: 503,
        code: "STRIPE_PORTAL_CONFIGURATION_REQUIRED",
        userMessage: "請求管理ページを開けませんでした。",
        action: "時間をおいて再度お試しください。解消しない場合はサポートにお問い合わせください。",
        developerMessage: "STRIPE_PORTAL_CONFIGURATION_ID is required in production",
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

    const customer = await stripe.customers.retrieve(subscription.stripeCustomerId);
    if ("deleted" in customer && customer.deleted) {
      return createApiErrorResponse(request, {
        status: 409,
        code: "STRIPE_PORTAL_CUSTOMER_UNAVAILABLE",
        userMessage: "請求管理ページを開けませんでした。",
        action: "サポートにお問い合わせください。",
        developerMessage: "Stripe customer is deleted",
      });
    }

    if (customer.metadata?.userId !== session.user.id) {
      return createApiErrorResponse(request, {
        status: 403,
        code: "STRIPE_PORTAL_CUSTOMER_OWNER_MISMATCH",
        userMessage: "請求管理ページを開けませんでした。",
        action: "サポートにお問い合わせください。",
        developerMessage: "Stripe customer metadata userId does not match the authenticated user",
      });
    }

    if (subscription.stripeSubscriptionId) {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      const subscriptionCustomerId = getStripeCustomerId(stripeSubscription.customer);
      if (subscriptionCustomerId !== subscription.stripeCustomerId) {
        return createApiErrorResponse(request, {
          status: 409,
          code: "STRIPE_PORTAL_SUBSCRIPTION_OWNER_MISMATCH",
          userMessage: "請求管理ページを開けませんでした。",
          action: "サポートにお問い合わせください。",
          developerMessage: "Stripe subscription customer does not match the stored customer",
        });
      }
    }

    // Create billing portal session
    const portalParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings?portal=return`,
      ...(portalConfigurationId ? { configuration: portalConfigurationId } : {}),
    };
    const portalSession = await stripe.billingPortal.sessions.create(portalParams);

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    return createApiErrorResponse(request, {
      status: 500,
      code: "STRIPE_PORTAL_CREATE_FAILED",
      userMessage: "請求管理ページを開けませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to create Stripe billing portal session",
      error,
      logContext: "stripe-portal",
    });
  }
}
