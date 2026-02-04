import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions, userProfiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getPlanFromPriceId, type PlanType } from "@/lib/stripe/config";
import { updatePlanAllocation } from "@/lib/credits";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event;

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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const planFromMetadata = session.metadata?.plan as PlanType | undefined;

      if (userId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        ) as Stripe.Subscription;

        // In Stripe SDK v20, current_period_end is on SubscriptionItem
        const subscriptionItem = subscription.items.data[0];
        const priceId = subscriptionItem.price.id;

        // Determine plan from metadata or price ID
        const newPlan = planFromMetadata || getPlanFromPriceId(priceId) || "standard";

        // Check if subscription already exists (upsert)
        const existingSub = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .get();

        if (existingSub) {
          await db
            .update(subscriptions)
            .set({
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              status: subscription.status,
              currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.userId, userId));
        } else {
          await db.insert(subscriptions).values({
            id: crypto.randomUUID(),
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId,
            status: subscription.status,
            currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }

        // Update user profile plan
        await db
          .update(userProfiles)
          .set({
            plan: newPlan,
            planSelectedAt: new Date(),
          })
          .where(eq(userProfiles.userId, userId));

        // Update credit allocation for new plan
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

      // Get the existing subscription to find userId
      const existingSub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
        .get();

      // Update subscription record
      await db
        .update(subscriptions)
        .set({
          stripePriceId: priceId,
          status: subscription.status,
          currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

      // If plan changed, update user profile and credits
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

      // Get the existing subscription to find userId
      const existingSub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
        .get();

      // Update subscription status
      await db
        .update(subscriptions)
        .set({
          status: "canceled",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

      // Downgrade user to free plan
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
  }

  return NextResponse.json({ received: true });
}
