import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions, userProfiles, processedStripeEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getPlanFromPriceId, type PlanType } from "@/lib/stripe/config";
import { updatePlanAllocation } from "@/lib/credits";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  // Atomic idempotency: claim the event before processing.
  // If the insert fails due to unique constraint, another handler already claimed it.
  try {
    await db.insert(processedStripeEvents).values({
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date(),
    });
  } catch (e) {
    // Unique constraint violation = already processing/processed
    console.log(`[Stripe Webhook] Event ${event.id} already claimed, skipping`);
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const planFromMetadata = session.metadata?.plan as PlanType | undefined;

        if (userId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          ) as Stripe.Subscription;

          const subscriptionItem = subscription.items.data[0];
          const priceId = subscriptionItem.price.id;
          const newPlan = planFromMetadata || getPlanFromPriceId(priceId) || "standard";

          // Use batch to ensure atomicity of subscription + profile + credit updates
          const existingSub = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.userId, userId))
            .get();

          if (existingSub) {
            await db.batch([
              db
                .update(subscriptions)
                .set({
                  stripeCustomerId: session.customer as string,
                  stripeSubscriptionId: subscription.id,
                  stripePriceId: priceId,
                  status: subscription.status,
                  currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
                  updatedAt: new Date(),
                })
                .where(eq(subscriptions.userId, userId)),
              db
                .update(userProfiles)
                .set({
                  plan: newPlan,
                  planSelectedAt: new Date(),
                })
                .where(eq(userProfiles.userId, userId)),
            ]);
          } else {
            await db.batch([
              db.insert(subscriptions).values({
                id: crypto.randomUUID(),
                userId,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: subscription.id,
                stripePriceId: priceId,
                status: subscription.status,
                currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
                createdAt: new Date(),
                updatedAt: new Date(),
              }),
              db
                .update(userProfiles)
                .set({
                  plan: newPlan,
                  planSelectedAt: new Date(),
                })
                .where(eq(userProfiles.userId, userId)),
            ]);
          }

          // Update credit allocation (separate call since it has its own logic)
          await updatePlanAllocation(userId, newPlan);

          console.log(`[Stripe Webhook] User ${userId} subscribed to ${newPlan} plan`);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionItem = subscription.items.data[0];
        const priceId = subscriptionItem.price.id;
        const newPlan = getPlanFromPriceId(priceId);

        const existingSub = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
          .get();

        // Batch: update subscription record + user profile
        await db
          .update(subscriptions)
          .set({
            stripePriceId: priceId,
            status: subscription.status,
            currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

        if (existingSub?.userId && newPlan) {
          await db
            .update(userProfiles)
            .set({
              plan: newPlan,
              planSelectedAt: new Date(),
            })
            .where(eq(userProfiles.userId, existingSub.userId));

          await updatePlanAllocation(existingSub.userId, newPlan);
          console.log(`[Stripe Webhook] User ${existingSub.userId} plan updated to ${newPlan}`);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const existingSub = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
          .get();

        await db
          .update(subscriptions)
          .set({
            status: "canceled",
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

        if (existingSub?.userId) {
          await db
            .update(userProfiles)
            .set({
              plan: "free",
              planSelectedAt: new Date(),
            })
            .where(eq(userProfiles.userId, existingSub.userId));

          await updatePlanAllocation(existingSub.userId, "free");
          console.log(`[Stripe Webhook] User ${existingSub.userId} downgraded to free plan`);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Stripe v20: subscription is in parent.subscription_details, but webhook payload includes it at top level
        const subscriptionId = (invoice.parent?.subscription_details?.subscription as string | null)
          ?? (invoice as unknown as { subscription: string | null }).subscription;

        if (subscriptionId) {
          await db
            .update(subscriptions)
            .set({
              status: "past_due",
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

          const sub = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
            .get();

          if (sub?.userId) {
            console.log(`[Stripe Webhook] Payment failed for user ${sub.userId}, subscription ${subscriptionId}`);
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice.parent?.subscription_details?.subscription as string | null)
          ?? (invoice as unknown as { subscription: string | null }).subscription;

        if (subscriptionId) {
          // Restore active status if it was past_due
          await db
            .update(subscriptions)
            .set({
              status: "active",
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
        }
        break;
      }
    }

    // Event already recorded at claim time (before processing)
  } catch (error) {
    console.error(`[Stripe Webhook] Error processing event ${event.id} (${event.type}):`, error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
