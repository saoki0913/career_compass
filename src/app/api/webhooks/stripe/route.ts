import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { logError } from "@/lib/logger";
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

async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event);
      logError("stripe-webhook-payment-failed", new Error("invoice.payment_failed"), {
        eventId: event.id,
        eventType: event.type,
      });
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event);
      break;
    case "charge.dispute.created":
      await handleDisputeCreated(event);
      break;
    case "charge.dispute.closed":
      await handleDisputeClosed(event);
      break;
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logError("stripe-webhook-config", new Error("STRIPE_WEBHOOK_SECRET is not configured"));
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    logError("stripe-webhook-verify", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  try {
    const claim = await claimStripeEvent(event);
    if (claim === "duplicate") {
      console.info(`[Stripe Webhook] Duplicate event skipped: ${event.type}`);
      return NextResponse.json({ received: true });
    }
  } catch (error) {
    logError("stripe-webhook-idempotency-claim", error, { eventId: event.id, eventType: event.type });
    return NextResponse.json(
      { error: "Webhook idempotency claim failed" },
      { status: 500 },
    );
  }

  try {
    await dispatchStripeEvent(event);
    await markStripeEventSucceeded(event);
  } catch (error) {
    await markStripeEventFailed(event, error)
      .catch((markError) => {
        logError("stripe-webhook-failed-state", markError, {
          eventId: event.id,
          eventType: event.type,
        });
      });
    logError("stripe-webhook-process", error, { eventId: event.id, eventType: event.type });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
