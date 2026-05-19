import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { serverEnv } from "@/env/server";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { stripe } from "@/lib/stripe";
import {
  handleChargeRefunded,
  handleCheckoutCompleted,
  handleDisputeClosed,
  handleDisputeCreated,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from "@/lib/stripe/webhook-handlers";
import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventSucceeded,
} from "@/lib/stripe/webhook-utils";

export const runtime = "nodejs";

export const SUPPORTED_STRIPE_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
] as const;

type SupportedStripeEventType = (typeof SUPPORTED_STRIPE_EVENT_TYPES)[number];
type StripeWebhookHandler = (event: Stripe.Event) => Promise<void>;

const STRIPE_EVENT_HANDLERS: Record<SupportedStripeEventType, StripeWebhookHandler> = {
  "checkout.session.completed": handleCheckoutCompleted,
  "customer.subscription.updated": handleSubscriptionUpdated,
  "customer.subscription.deleted": handleSubscriptionDeleted,
  "invoice.payment_succeeded": handleInvoicePaymentSucceeded,
  "invoice.payment_failed": async (event) => {
    await handleInvoicePaymentFailed(event);
    logWarn("stripe-webhook-payment-failed", {
      eventId: event.id,
      eventType: event.type,
    });
  },
  "charge.refunded": handleChargeRefunded,
  "charge.dispute.created": handleDisputeCreated,
  "charge.dispute.closed": handleDisputeClosed,
};

function isSupportedStripeEventType(type: string): type is SupportedStripeEventType {
  return SUPPORTED_STRIPE_EVENT_TYPES.includes(type as SupportedStripeEventType);
}

async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  if (!isSupportedStripeEventType(event.type)) {
    logInfo("stripe-webhook-unhandled-event", {
      eventId: event.id,
      eventType: event.type,
    });
    return;
  }
  await STRIPE_EVENT_HANDLERS[event.type](event);
}

function requestIdFor(req: Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

function stripeWebhookResponse(
  requestId: string,
  payload: Record<string, unknown>,
  status = 200,
) {
  return NextResponse.json(
    {
      requestId,
      ...payload,
    },
    {
      status,
      headers: {
        "X-Request-Id": requestId,
      },
    },
  );
}

export async function POST(req: Request) {
  const requestId = requestIdFor(req);
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return stripeWebhookResponse(requestId, {
      received: false,
      retry: false,
      code: "STRIPE_SIGNATURE_MISSING",
      error: "Missing stripe-signature header",
    }, 400);
  }

  let event: Stripe.Event;
  let webhookSecret: string;

  try {
    webhookSecret = serverEnv.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logError("stripe-webhook-config", new Error("STRIPE_WEBHOOK_SECRET is not configured"), { requestId });
      return stripeWebhookResponse(requestId, {
        received: false,
        retry: true,
        code: "STRIPE_WEBHOOK_NOT_CONFIGURED",
        error: "Webhook not configured",
      }, 500);
    }
  } catch (err) {
    logError("stripe-webhook-config", err, { requestId });
    return stripeWebhookResponse(requestId, {
      received: false,
      retry: true,
      code: "STRIPE_WEBHOOK_NOT_CONFIGURED",
      error: "Webhook not configured",
    }, 500);
  }

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    logError("stripe-webhook-verify", err, { requestId });
    return stripeWebhookResponse(requestId, {
      received: false,
      retry: false,
      code: "STRIPE_SIGNATURE_VERIFICATION_FAILED",
      error: "Webhook signature verification failed",
    }, 400);
  }

  try {
    const claim = await claimStripeEvent(event);
    if (claim === "duplicate_succeeded") {
      logInfo("stripe-webhook-duplicate-skipped", {
        requestId,
        eventId: event.id,
        eventType: event.type,
      });
      return stripeWebhookResponse(requestId, { received: true });
    }
    if (claim === "in_flight") {
      logError("stripe-webhook-in-flight", new Error("Stripe event is already processing"), {
        requestId,
        eventId: event.id,
        eventType: event.type,
      });
      return stripeWebhookResponse(requestId, {
        received: false,
        retry: true,
        reason: "event_in_flight",
        code: "STRIPE_EVENT_IN_FLIGHT",
      }, 409);
    }
  } catch (error) {
    logError("stripe-webhook-idempotency-claim", error, { requestId, eventId: event.id, eventType: event.type });
    return stripeWebhookResponse(requestId, {
      received: false,
      retry: true,
      code: "STRIPE_IDEMPOTENCY_CLAIM_FAILED",
      error: "Webhook idempotency claim failed",
    }, 500);
  }

  try {
    await dispatchStripeEvent(event);
    await markStripeEventSucceeded(event);
  } catch (error) {
    await markStripeEventFailed(event, error)
      .catch((markError) => {
        logError("stripe-webhook-failed-state", markError, {
          requestId,
          eventId: event.id,
          eventType: event.type,
        });
      });
    logError("stripe-webhook-process", error, { requestId, eventId: event.id, eventType: event.type });
    return stripeWebhookResponse(requestId, {
      received: false,
      retry: true,
      code: "STRIPE_WEBHOOK_PROCESSING_FAILED",
      error: "Webhook processing failed",
    }, 500);
  }

  return stripeWebhookResponse(requestId, { received: true });
}
