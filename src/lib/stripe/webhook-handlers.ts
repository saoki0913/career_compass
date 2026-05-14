import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { updatePlanAllocationCoreTx } from "@/lib/credits";
import { db } from "@/lib/db";
import { notifications, subscriptions, userProfiles } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import {
  assertCheckoutOwnership,
  isOlderThanStoredStripeEvent,
  isSubscriptionEntitled,
  requirePlanFromPriceId,
  stripeEventCreatedAt,
  stripeObjectId,
  type StoredSubscriptionState,
} from "@/lib/stripe/webhook-utils";

type WebhookTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return (invoice.parent?.subscription_details?.subscription as string | null)
    ?? (invoice as { subscription?: string | null }).subscription
    ?? null;
}

async function getInvoiceFromCharge(charge: Stripe.Charge): Promise<Stripe.Invoice | null> {
  const invoiceId = stripeObjectId((charge as { invoice?: string | Stripe.Invoice | null }).invoice);
  if (!invoiceId) {
    return null;
  }
  return stripe.invoices.retrieve(invoiceId) as Promise<Stripe.Invoice>;
}

async function getSubscriptionIdFromCharge(charge: Stripe.Charge): Promise<string | null> {
  const invoice = await getInvoiceFromCharge(charge);
  return invoice ? getInvoiceSubscriptionId(invoice) : null;
}

function isFullyRefundedCharge(charge: Stripe.Charge): boolean {
  return Boolean(charge.refunded) || charge.amount_refunded >= charge.amount;
}

async function notifyBillingStatusTx(
  tx: WebhookTransaction,
  userId: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
  sourceEventId?: string,
): Promise<void> {
  const now = new Date();
  const insert = tx.insert(notifications).values({
    id: crypto.randomUUID(),
    userId,
    guestId: null,
    type: "billing_status",
    title,
    message,
    data: data ?? null,
    sourceEventId: sourceEventId ?? null,
    isRead: false,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
  });
  if (sourceEventId) {
    await insert.onConflictDoNothing();
    return;
  }
  await insert;
}

async function selectSubscriptionByStripeIdTx(
  tx: WebhookTransaction,
  subscriptionId: string,
): Promise<StoredSubscriptionState | null> {
  const [existingSub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);
  return existingSub ?? null;
}

async function downgradeSubscriptionToFreeTx(
  tx: WebhookTransaction,
  subscriptionId: string,
  status: string,
  event?: Stripe.Event,
): Promise<boolean> {
  const existingSub = await selectSubscriptionByStripeIdTx(tx, subscriptionId);

  if (event && isOlderThanStoredStripeEvent(existingSub, event)) {
    return false;
  }

  await tx
    .update(subscriptions)
    .set({
      status,
      cancelAtPeriodEnd: status === "canceled" ? true : undefined,
      lastStripeEventId: event?.id,
      lastStripeEventCreatedAt: event ? stripeEventCreatedAt(event) : undefined,
      lastEntitlementSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  if (!existingSub?.userId) {
    return false;
  }

  await tx
    .update(userProfiles)
    .set({
      plan: "free",
      planSelectedAt: new Date(),
    })
    .where(eq(userProfiles.userId, existingSub.userId));

  await updatePlanAllocationCoreTx(tx, existingSub.userId, "free");
  return true;
}

export async function downgradeSubscriptionToFree(
  subscriptionId: string,
  status: string,
  event?: Stripe.Event,
): Promise<boolean> {
  return db.transaction((tx) => downgradeSubscriptionToFreeTx(tx, subscriptionId, status, event));
}

export async function restoreSubscriptionIfEntitled(
  subscriptionId: string,
  eventType: string,
  event?: Stripe.Event,
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
  const subscriptionItem = subscription.items.data[0];
  if (!subscriptionItem || !isSubscriptionEntitled(subscription)) {
    await downgradeSubscriptionToFree(subscriptionId, subscription.status, event);
    return;
  }

  const priceId = subscriptionItem.price.id;
  const plan = requirePlanFromPriceId(priceId, eventType);

  await db.transaction(async (tx) => {
    const existingSub = await selectSubscriptionByStripeIdTx(tx, subscription.id);

    if (event && isOlderThanStoredStripeEvent(existingSub, event)) {
      return;
    }

    await tx
      .update(subscriptions)
      .set({
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        lastStripeEventId: event?.id,
        lastStripeEventCreatedAt: event ? stripeEventCreatedAt(event) : undefined,
        lastEntitlementSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

    if (!existingSub?.userId) {
      return;
    }

    await tx
      .update(userProfiles)
      .set({
        plan,
        planSelectedAt: new Date(),
      })
      .where(eq(userProfiles.userId, existingSub.userId));

    await updatePlanAllocationCoreTx(tx, existingSub.userId, plan);
  });
}

export async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const subscriptionId = stripeObjectId(session.subscription as string | Stripe.Subscription | null);

  if (!userId || !subscriptionId) {
    return;
  }

  const sessionCustomerId = stripeObjectId(
    session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null,
  );
  if (!sessionCustomerId) {
    throw new Error(`checkout.session.completed missing customer: ${session.id}`);
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription;
  const subscriptionItem = subscription.items.data[0];
  const priceId = subscriptionItem?.price.id ?? null;
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  await assertCheckoutOwnership({
    userId,
    sessionCustomerId,
    subscription,
    existingSub,
  });

  if (isOlderThanStoredStripeEvent(existingSub, event)) {
    return;
  }

  const subscriptionState = {
    stripeCustomerId: sessionCustomerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status,
    currentPeriodEnd: subscriptionItem
      ? new Date(subscriptionItem.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    lastStripeEventId: event.id,
    lastStripeEventCreatedAt: stripeEventCreatedAt(event),
    lastEntitlementSyncedAt: new Date(),
    updatedAt: new Date(),
  };

  if (!subscriptionItem || !priceId || !isSubscriptionEntitled(subscription)) {
    await db.transaction(async (tx) => {
      const [currentSub] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);

      if (isOlderThanStoredStripeEvent(currentSub, event)) {
        return;
      }

      if (currentSub) {
        await tx
          .update(subscriptions)
          .set(subscriptionState)
          .where(eq(subscriptions.userId, userId));
      } else {
        await tx.insert(subscriptions).values({
          id: crypto.randomUUID(),
          userId,
          ...subscriptionState,
          createdAt: new Date(),
        });
      }
    });
    console.info(`[Stripe Webhook] checkout.session.completed: entitlement pending (${subscription.status})`);
    return;
  }

  const newPlan = requirePlanFromPriceId(priceId, event.type);

  await db.transaction(async (tx) => {
    const [currentSub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);

    if (isOlderThanStoredStripeEvent(currentSub, event)) {
      return;
    }

    if (currentSub) {
      await tx
        .update(subscriptions)
        .set(subscriptionState)
        .where(eq(subscriptions.userId, userId));
    } else {
      await tx.insert(subscriptions).values({
        id: crypto.randomUUID(),
        userId,
        ...subscriptionState,
        createdAt: new Date(),
      });
    }
    await tx
      .update(userProfiles)
      .set({
        plan: newPlan,
        planSelectedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));
    await updatePlanAllocationCoreTx(tx, userId, newPlan);
  });

  console.info(`[Stripe Webhook] checkout.session.completed: plan=${newPlan}`);
}

export async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const subscriptionItem = subscription.items.data[0];
  const priceId = subscriptionItem?.price.id ?? null;
  const newPlan = subscriptionItem && isSubscriptionEntitled(subscription) && priceId
    ? requirePlanFromPriceId(priceId, event.type)
    : "free";

  await db.transaction(async (tx) => {
    const existingSub = await selectSubscriptionByStripeIdTx(tx, subscription.id);

    if (isOlderThanStoredStripeEvent(existingSub, event)) {
      return;
    }

    if (!subscriptionItem || !priceId || !isSubscriptionEntitled(subscription)) {
      await tx
        .update(subscriptions)
        .set({
          status: subscription.status,
          currentPeriodEnd: subscriptionItem?.current_period_end
            ? new Date(subscriptionItem.current_period_end * 1000)
            : undefined,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          lastStripeEventId: event.id,
          lastStripeEventCreatedAt: stripeEventCreatedAt(event),
          lastEntitlementSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

      if (existingSub?.userId) {
        await tx
          .update(userProfiles)
          .set({
            plan: "free",
            planSelectedAt: new Date(),
          })
          .where(eq(userProfiles.userId, existingSub.userId));

        await updatePlanAllocationCoreTx(tx, existingSub.userId, "free");
        console.info("[Stripe Webhook] subscription.updated: downgraded to free");
      }
      return;
    }

    await tx
      .update(subscriptions)
      .set({
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        lastStripeEventId: event.id,
        lastStripeEventCreatedAt: stripeEventCreatedAt(event),
        lastEntitlementSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

    if (existingSub?.userId) {
      await tx
        .update(userProfiles)
        .set({
          plan: newPlan,
          planSelectedAt: new Date(),
        })
        .where(eq(userProfiles.userId, existingSub.userId));

      await updatePlanAllocationCoreTx(tx, existingSub.userId, newPlan);
      console.info(`[Stripe Webhook] subscription.updated: plan=${newPlan}`);
    }
  });
}

export async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  await downgradeSubscriptionToFree(subscription.id, "canceled", event);
  console.info("[Stripe Webhook] subscription.deleted: downgraded to free");
}

export async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (subscriptionId) {
    await restoreSubscriptionIfEntitled(subscriptionId, event.type, event);
  }
}

export async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = getInvoiceSubscriptionId(invoice);

  if (subscriptionId) {
    await restoreSubscriptionIfEntitled(subscriptionId, event.type, event);
  }
}

export async function applyBillingHoldForDispute(
  dispute: Stripe.Dispute,
  event: Stripe.Event,
): Promise<void> {
  const chargeId = stripeObjectId(dispute.charge as string | Stripe.Charge | null | undefined);
  if (!chargeId) {
    return;
  }

  const charge = await stripe.charges.retrieve(chargeId) as Stripe.Charge;
  const subscriptionId = await getSubscriptionIdFromCharge(charge);
  if (!subscriptionId) {
    return;
  }

  await db.transaction(async (tx) => {
    const existingSub = await selectSubscriptionByStripeIdTx(tx, subscriptionId);

    if (isOlderThanStoredStripeEvent(existingSub, event)) {
      return;
    }

    await tx
      .update(subscriptions)
      .set({
        billingHoldStatus: "dispute",
        billingHoldReason: "支払いに関する確認中のため、AI機能のクレジット利用を一時停止しています。",
        billingHoldStripeDisputeId: dispute.id,
        billingHoldStartedAt: new Date(),
        billingHoldEndedAt: null,
        lastStripeEventId: event.id,
        lastStripeEventCreatedAt: stripeEventCreatedAt(event),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

    if (existingSub?.userId) {
      await notifyBillingStatusTx(
        tx,
        existingSub.userId,
        "お支払い状況を確認しています",
        "支払いに関する確認が発生したため、AI機能のクレジット利用を一時停止しています。確認が完了すると再開されます。",
        { kind: "dispute_created" },
        `stripe:${dispute.id}:created`,
      );
    }
  });
}

export async function clearBillingHoldForDispute(
  dispute: Stripe.Dispute,
  event: Stripe.Event,
): Promise<void> {
  const chargeId = stripeObjectId(dispute.charge as string | Stripe.Charge | null | undefined);
  if (!chargeId) {
    return;
  }

  const charge = await stripe.charges.retrieve(chargeId) as Stripe.Charge;
  const subscriptionId = await getSubscriptionIdFromCharge(charge);
  if (!subscriptionId) {
    return;
  }

  await db.transaction(async (tx) => {
    const existingSub = await selectSubscriptionByStripeIdTx(tx, subscriptionId);

    if (isOlderThanStoredStripeEvent(existingSub, event)) {
      return;
    }

    const recordClosedDisputeEvent = async (): Promise<void> => {
      await tx
        .update(subscriptions)
        .set({
          lastStripeEventId: event.id,
          lastStripeEventCreatedAt: stripeEventCreatedAt(event),
          lastEntitlementSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
    };

    if (dispute.status === "won") {
      if (!existingSub?.userId || existingSub.billingHoldStripeDisputeId !== dispute.id) {
        await recordClosedDisputeEvent();
        return;
      }

      await tx
        .update(subscriptions)
        .set({
          billingHoldStatus: "none",
          billingHoldReason: null,
          billingHoldEndedAt: new Date(),
          lastStripeEventId: event.id,
          lastStripeEventCreatedAt: stripeEventCreatedAt(event),
          lastEntitlementSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptions.stripeSubscriptionId, subscriptionId),
          eq(subscriptions.billingHoldStripeDisputeId, dispute.id),
        ));

      await notifyBillingStatusTx(
        tx,
        existingSub.userId,
        "お支払い状況の確認が完了しました",
        "支払いに関する確認が完了しました。AI機能のクレジット利用を再開できます。",
        { kind: "dispute_won" },
        `stripe:${dispute.id}:won`,
      );
      return;
    }

    if (dispute.status !== "lost" && (!existingSub?.userId || existingSub.billingHoldStripeDisputeId !== dispute.id)) {
      await recordClosedDisputeEvent();
      return;
    }

    if (dispute.status !== "lost") {
      if (!existingSub?.userId) {
        await recordClosedDisputeEvent();
        return;
      }

      await tx
        .update(subscriptions)
        .set({
          billingHoldStatus: "none",
          billingHoldReason: null,
          billingHoldEndedAt: new Date(),
          lastStripeEventId: event.id,
          lastStripeEventCreatedAt: stripeEventCreatedAt(event),
          lastEntitlementSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptions.stripeSubscriptionId, subscriptionId),
          eq(subscriptions.billingHoldStripeDisputeId, dispute.id),
        ));

      await notifyBillingStatusTx(
        tx,
        existingSub.userId,
        "お支払い状況の確認が完了しました",
        "支払いに関する確認が完了しました。現在のプランは継続されます。",
        { kind: "dispute_closed_no_plan_change", status: dispute.status },
        `stripe:${dispute.id}:${dispute.status}`,
      );
      return;
    }

    const downgraded = await downgradeSubscriptionToFreeTx(tx, subscriptionId, "dispute_lost", event);
    if (!downgraded) {
      await recordClosedDisputeEvent();
      return;
    }
    if (!existingSub?.userId) {
      return;
    }
    await tx
      .update(subscriptions)
      .set({
        billingHoldStatus: "none",
        billingHoldReason: null,
        billingHoldEndedAt: new Date(),
        lastStripeEventId: event.id,
        lastStripeEventCreatedAt: stripeEventCreatedAt(event),
        lastEntitlementSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptions.stripeSubscriptionId, subscriptionId),
        eq(subscriptions.billingHoldStripeDisputeId, dispute.id),
      ));

    await notifyBillingStatusTx(
      tx,
      existingSub.userId,
      "お支払い確認の結果を反映しました",
      "支払いに関する確認結果に基づき、プランをFreeに変更しました。",
      { kind: "dispute_lost" },
      `stripe:${dispute.id}:lost`,
    );
  });
}

export async function handleRefundedCharge(
  charge: Stripe.Charge,
  event: Stripe.Event,
): Promise<void> {
  const invoice = await getInvoiceFromCharge(charge);
  if (!invoice) {
    return;
  }

  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return;
  }

  const stripeSubscription = isFullyRefundedCharge(charge)
    ? await stripe.subscriptions.retrieve(subscriptionId) as Stripe.Subscription
    : null;

  await db.transaction(async (tx) => {
    const existingSub = await selectSubscriptionByStripeIdTx(tx, subscriptionId);

    if (!existingSub?.userId) {
      return;
    }

    if (!isFullyRefundedCharge(charge)) {
      await notifyBillingStatusTx(
        tx,
        existingSub.userId,
        "返金を受け付けました",
        "一部返金を確認しました。現在のプランは継続されます。",
        { kind: "partial_refund" },
        `stripe:${charge.id}:partial_refund`,
      );
      return;
    }

    const latestInvoiceId = stripeObjectId(
      (stripeSubscription as { latest_invoice?: string | Stripe.Invoice | null }).latest_invoice,
    );
    if (latestInvoiceId !== invoice.id) {
      await notifyBillingStatusTx(
        tx,
        existingSub.userId,
        "返金を受け付けました",
        "過去の請求に対する返金を確認しました。現在のプランは継続されます。",
        { kind: "full_refund_no_plan_change" },
        `stripe:${charge.id}:full_refund_no_plan_change`,
      );
      return;
    }

    const downgraded = await downgradeSubscriptionToFreeTx(tx, subscriptionId, "refunded", event);
    if (!downgraded) {
      return;
    }
    await notifyBillingStatusTx(
      tx,
      existingSub.userId,
      "返金を反映しました",
      "返金処理に伴い、プランをFreeに変更しました。",
      { kind: "full_refund" },
      `stripe:${charge.id}:full_refund`,
    );
  });
}

export async function handleChargeRefunded(event: Stripe.Event): Promise<void> {
  const charge = event.data.object as Stripe.Charge;
  await handleRefundedCharge(charge, event);
}

export async function handleDisputeCreated(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  await applyBillingHoldForDispute(dispute, event);
}

export async function handleDisputeClosed(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;
  await clearBillingHoldForDispute(dispute, event);
}
