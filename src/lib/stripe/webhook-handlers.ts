import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import { updatePlanAllocationCoreTx } from "@/lib/credits";
import { db } from "@/lib/db";
import { notifications, subscriptions, userProfiles } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import {
  assertCheckoutOwnership,
  hasSameStripeSubscriptionWatermarkRank,
  isOlderThanStoredStripeEvent,
  isSubscriptionEntitled,
  requirePlanFromPriceId,
  shouldApplySubscriptionEvent,
  stripeSubscriptionEventWatermark,
  type StripeSubscriptionMutationKind,
  stripeObjectId,
  type StoredSubscriptionState,
} from "@/lib/stripe/webhook-utils";

type WebhookTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FinancialDowngradeStatus = "refunded" | "dispute_lost";
type SubscriptionDowngradeStatus = Stripe.Subscription.Status | FinancialDowngradeStatus;

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

async function upsertUserPlanTx(
  tx: WebhookTransaction,
  userId: string,
  plan: "free" | "standard" | "pro",
): Promise<void> {
  const now = new Date();
  await tx
    .insert(userProfiles)
    .values({
      id: crypto.randomUUID(),
      userId,
      plan,
      planSelectedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        plan,
        planSelectedAt: now,
        updatedAt: now,
      },
    });
}

function isFinancialDowngradeStatus(status: SubscriptionDowngradeStatus): boolean {
  return status === "refunded" || status === "dispute_lost";
}

function isTerminalCancellationStatus(status: SubscriptionDowngradeStatus): boolean {
  return status === "canceled" || status === "incomplete_expired";
}

function hasFinancialDowngradeStatus(
  subscription: Pick<StoredSubscriptionState, "status"> | null | undefined,
): boolean {
  return subscription?.status === "refunded" || subscription?.status === "dispute_lost";
}

function shouldApplyDisputeCreatedHold(
  existingSub: Pick<
    StoredSubscriptionState,
    "billingHoldStripeDisputeId" | "lastStripeEventCreatedAt" | "lastStripeEventType"
  > | null | undefined,
  dispute: Stripe.Dispute,
  event: Stripe.Event,
): boolean {
  const lastCreatedAt = existingSub?.lastStripeEventCreatedAt;
  const eventCreatedAt = new Date(event.created * 1000);
  if (lastCreatedAt && lastCreatedAt.getTime() > eventCreatedAt.getTime()) {
    return false;
  }
  if (
    existingSub?.billingHoldStripeDisputeId === dispute.id &&
    existingSub.lastStripeEventType === "charge.dispute.closed" &&
    lastCreatedAt &&
    lastCreatedAt.getTime() >= eventCreatedAt.getTime()
  ) {
    return false;
  }
  return true;
}

function eventWatermarkForAppliedUpdate(
  existingSub: Pick<StoredSubscriptionState, "lastStripeEventId" | "lastStripeEventCreatedAt" | "lastStripeEventRank" | "lastStripeEventType"> | null | undefined,
  event: Stripe.Event | undefined,
  kind: StripeSubscriptionMutationKind = "subscription_updated",
): {
  lastStripeEventId?: string;
  lastStripeEventCreatedAt?: Date;
  lastStripeEventType?: string;
  lastStripeEventRank?: number;
} {
  if (!event) {
    return {};
  }

  if (!shouldApplySubscriptionEvent(existingSub, event, kind)) {
    return {
      lastStripeEventId: existingSub?.lastStripeEventId ?? undefined,
      lastStripeEventCreatedAt: existingSub?.lastStripeEventCreatedAt ?? undefined,
      lastStripeEventType: existingSub?.lastStripeEventType ?? undefined,
      lastStripeEventRank: existingSub?.lastStripeEventRank ?? undefined,
    };
  }

  return stripeSubscriptionEventWatermark(event, kind);
}

async function downgradeSubscriptionToFreeTx(
  tx: WebhookTransaction,
  subscriptionId: string,
  status: SubscriptionDowngradeStatus,
  event?: Stripe.Event,
): Promise<boolean> {
  const existingSub = await selectSubscriptionByStripeIdTx(tx, subscriptionId);

  const downgradeKind: StripeSubscriptionMutationKind = isFinancialDowngradeStatus(status)
    ? "financial_downgrade"
    : "subscription_deleted";
  if (
    event &&
    !isFinancialDowngradeStatus(status) &&
    !shouldApplySubscriptionEvent(existingSub, event, downgradeKind)
  ) {
    return false;
  }

  if (
    existingSub &&
    hasFinancialDowngradeStatus(existingSub) &&
    !isFinancialDowngradeStatus(status) &&
    !isTerminalCancellationStatus(status)
  ) {
    return false;
  }

  const eventWatermark = eventWatermarkForAppliedUpdate(existingSub, event, downgradeKind);

  await tx
    .update(subscriptions)
    .set({
      status,
      cancelAtPeriodEnd: status === "canceled" ? true : undefined,
      ...eventWatermark,
      lastEntitlementSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));

  if (!existingSub?.userId) {
    return false;
  }

  await upsertUserPlanTx(tx, existingSub.userId, "free");

  await updatePlanAllocationCoreTx(tx, existingSub.userId, "free");
  return true;
}

export async function downgradeSubscriptionToFree(
  subscriptionId: string,
  status: SubscriptionDowngradeStatus,
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

    if (event && !shouldApplySubscriptionEvent(existingSub, event, "restore")) {
      return;
    }

    if (hasFinancialDowngradeStatus(existingSub)) {
      return;
    }

    await tx
      .update(subscriptions)
      .set({
        stripePriceId: priceId,
        status: subscription.status,
        currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        ...(event ? stripeSubscriptionEventWatermark(event, "restore") : {}),
        lastEntitlementSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

    if (!existingSub?.userId) {
      return;
    }

    await upsertUserPlanTx(tx, existingSub.userId, plan);

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

  if (!shouldApplySubscriptionEvent(existingSub, event, "checkout")) {
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
    ...stripeSubscriptionEventWatermark(event, "checkout"),
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

      if (!shouldApplySubscriptionEvent(currentSub, event, "checkout")) {
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

    if (!shouldApplySubscriptionEvent(currentSub, event, "checkout")) {
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
    await upsertUserPlanTx(tx, userId, newPlan);
    await updatePlanAllocationCoreTx(tx, userId, newPlan);
  });

  console.info(`[Stripe Webhook] checkout.session.completed: plan=${newPlan}`);
}

export async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const eventSubscription = event.data.object as Stripe.Subscription;
  let subscription = eventSubscription;
  let subscriptionItem = subscription.items.data[0];

  await db.transaction(async (tx) => {
    const existingSub = await selectSubscriptionByStripeIdTx(tx, subscription.id);
    const sameRankWatermark = hasSameStripeSubscriptionWatermarkRank(
      existingSub,
      event,
      "subscription_updated",
    );

    if (!sameRankWatermark && !shouldApplySubscriptionEvent(existingSub, event, "subscription_updated")) {
      return;
    }

    if (hasFinancialDowngradeStatus(existingSub)) {
      return;
    }

    if (sameRankWatermark) {
      subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
      subscriptionItem = subscription.items.data[0];
    }

    const effectivePriceId = subscriptionItem?.price.id ?? null;
    const newPlan = subscriptionItem && isSubscriptionEntitled(subscription) && effectivePriceId
      ? requirePlanFromPriceId(effectivePriceId, event.type)
      : "free";

    if (!subscriptionItem || !effectivePriceId || !isSubscriptionEntitled(subscription)) {
      await tx
        .update(subscriptions)
        .set({
          status: subscription.status,
          currentPeriodEnd: subscriptionItem?.current_period_end
            ? new Date(subscriptionItem.current_period_end * 1000)
            : undefined,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          ...eventWatermarkForAppliedUpdate(existingSub, event, "subscription_updated"),
          lastEntitlementSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

      if (existingSub?.userId) {
        await upsertUserPlanTx(tx, existingSub.userId, "free");

        await updatePlanAllocationCoreTx(tx, existingSub.userId, "free");
        console.info("[Stripe Webhook] subscription.updated: downgraded to free");
      }
      return;
    }

    await tx
      .update(subscriptions)
      .set({
        stripePriceId: effectivePriceId,
        status: subscription.status,
        currentPeriodEnd: new Date(subscriptionItem.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        ...eventWatermarkForAppliedUpdate(existingSub, event, "subscription_updated"),
        lastEntitlementSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

    if (existingSub?.userId) {
      await upsertUserPlanTx(tx, existingSub.userId, newPlan);

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

    if (!shouldApplyDisputeCreatedHold(existingSub, dispute, event)) {
      return;
    }

    const eventWatermark = eventWatermarkForAppliedUpdate(existingSub, event, "billing_hold_opened");

    await tx
      .update(subscriptions)
      .set({
        billingHoldStatus: "dispute",
        billingHoldReason: "支払いに関する確認中のため、AI機能のクレジット利用を一時停止しています。",
        billingHoldStripeDisputeId: dispute.id,
        billingHoldStartedAt: new Date(),
        billingHoldEndedAt: null,
        ...eventWatermark,
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

    if (dispute.status !== "lost" && isOlderThanStoredStripeEvent(existingSub, event)) {
      return;
    }

    const recordClosedDisputeEvent = async (): Promise<void> => {
      const eventWatermark = eventWatermarkForAppliedUpdate(existingSub, event, "billing_hold_closed");
      await tx
        .update(subscriptions)
        .set({
          ...eventWatermark,
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

      const eventWatermark = eventWatermarkForAppliedUpdate(existingSub, event, "billing_hold_closed");
      await tx
        .update(subscriptions)
        .set({
          billingHoldStatus: "none",
          billingHoldReason: null,
          billingHoldEndedAt: new Date(),
          ...eventWatermark,
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

      const eventWatermark = eventWatermarkForAppliedUpdate(existingSub, event, "billing_hold_closed");
      await tx
        .update(subscriptions)
        .set({
          billingHoldStatus: "none",
          billingHoldReason: null,
          billingHoldEndedAt: new Date(),
          ...eventWatermark,
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
    const eventWatermark = eventWatermarkForAppliedUpdate(existingSub, event, "financial_downgrade");
    await tx
      .update(subscriptions)
      .set({
        billingHoldStatus: "none",
        billingHoldReason: null,
        billingHoldEndedAt: new Date(),
        ...eventWatermark,
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
