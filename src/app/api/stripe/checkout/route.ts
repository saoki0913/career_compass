/**
 * Stripe Checkout Session API
 *
 * POST: Create a checkout session for subscription
 * Body: { plan: "standard" | "pro", period?: "monthly" | "annual" }
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPriceId, type PlanType, type BillingPeriod } from "@/lib/stripe/config";
import { getAppUrl } from "@/lib/app-url";
import { createApiErrorResponse } from "@/bff/api/error-response";
import { requireUserMutationRequest } from "@/bff/api/mutation-guard";
import { logError } from "@/lib/logger";
import { createHash } from "crypto";

type CheckoutCancelSource = "lp-pricing";

const NON_TERMINAL_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "paused",
  "incomplete",
]);

type CheckoutDatabase = typeof db;

type OpenCheckoutSessionDecision =
  | { kind: "none" }
  | { kind: "reuse"; session: Stripe.Checkout.Session }
  | { kind: "conflict"; session: Stripe.Checkout.Session };

class StripeCheckoutCustomerError extends Error {
  constructor(
    readonly status: 403 | 409,
    readonly code: string,
    readonly userMessage: string,
    readonly action: string,
    developerMessage: string,
  ) {
    super(developerMessage);
    this.name = "StripeCheckoutCustomerError";
  }
}

function getCheckoutCancelUrl(appUrl: string, value: unknown): string {
  const cancelSource: CheckoutCancelSource | null = value === "lp-pricing" ? "lp-pricing" : null;
  if (cancelSource === "lp-pricing") {
    return `${appUrl}/?checkout=canceled&source=lp-pricing#pricing`;
  }
  return `${appUrl}/pricing?canceled=true`;
}

function hasNonTerminalSubscriptionStatus(status: string | null | undefined): boolean {
  return Boolean(status && NON_TERMINAL_SUBSCRIPTION_STATUSES.has(status));
}

function findNonTerminalStripeSubscription(
  items: Stripe.Subscription[],
): Stripe.Subscription | null {
  return items.find((subscription) => hasNonTerminalSubscriptionStatus(subscription.status)) ?? null;
}

async function assertOwnedStripeCustomer(
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if ("deleted" in customer && customer.deleted) {
    throw new StripeCheckoutCustomerError(
      409,
      "STRIPE_CHECKOUT_CUSTOMER_UNAVAILABLE",
      "プラン変更を開始できませんでした。",
      "サポートにお問い合わせください。",
      `Stripe customer is deleted: ${stripeCustomerId}`,
    );
  }
  if (customer.metadata?.userId !== userId) {
    throw new StripeCheckoutCustomerError(
      403,
      "STRIPE_CHECKOUT_CUSTOMER_OWNER_MISMATCH",
      "プラン変更を開始できませんでした。",
      "サポートにお問い合わせください。",
      `Stripe customer metadata userId ${customer.metadata?.userId ?? "<missing>"} does not match ${userId}`,
    );
  }
}

async function findOpenCheckoutSession(
  stripeCustomerId: string,
  plan: PlanType,
  period: BillingPeriod,
): Promise<OpenCheckoutSessionDecision> {
  let reusableSession: Stripe.Checkout.Session | null = null;
  let startingAfter: string | undefined;

  do {
    const sessions = await stripe.checkout.sessions.list({
      customer: stripeCustomerId,
      status: "open",
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });

    for (const session of sessions.data) {
      if (session.status !== "open") {
        continue;
      }
      if (
        !session.url ||
        session.metadata?.plan !== plan ||
        session.metadata?.period !== period
      ) {
        return { kind: "conflict", session };
      }
      reusableSession ??= session;
    }

    startingAfter = sessions.has_more ? sessions.data.at(-1)?.id : undefined;
  } while (startingAfter);

  return reusableSession ? { kind: "reuse", session: reusableSession } : { kind: "none" };
}

async function persistStripeCustomerId(
  database: CheckoutDatabase,
  userId: string,
  stripeCustomerId: string,
): Promise<string> {
  const now = new Date();
  await database
    .insert(subscriptions)
    .values({
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        stripeCustomerId: sql`coalesce(${subscriptions.stripeCustomerId}, ${stripeCustomerId})`,
        updatedAt: now,
      },
    });

  const [storedSubscription] = await database
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!storedSubscription?.stripeCustomerId) {
    throw new Error("Failed to persist Stripe customer id for checkout");
  }

  return storedSubscription.stripeCustomerId;
}

async function withCheckoutCreationLock<T>(
  userId: string,
  operation: (database: CheckoutDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stripe_checkout:${userId}`}))`);
    return operation(tx as CheckoutDatabase);
  });
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireUserMutationRequest(req);
    if (!guard.ok) return guard.response;

    const appUrl = getAppUrl();
    const { session } = guard;

    const body = await req.json();
    const plan = body.plan as PlanType;
    const period = (body.period || "monthly") as BillingPeriod;
    const cancelUrl = getCheckoutCancelUrl(appUrl, body.cancelSource);

    // Validate plan
    if (!plan || !["standard", "pro"].includes(plan)) {
      return createApiErrorResponse(req, {
        status: 400,
        code: "STRIPE_CHECKOUT_INVALID_PLAN",
        userMessage: "プランの選択内容を確認してください。",
        developerMessage: "Invalid plan selection",
      });
    }

    // Validate period
    if (!["monthly", "annual"].includes(period)) {
      return createApiErrorResponse(req, {
        status: 400,
        code: "STRIPE_CHECKOUT_INVALID_PERIOD",
        userMessage: "お支払い期間の選択内容を確認してください。",
        developerMessage: "Invalid billing period. Must be 'monthly' or 'annual'.",
      });
    }

    // Get price ID
    const priceId = getPriceId(plan, period);
    if (!priceId) {
      return createApiErrorResponse(req, {
        status: 500,
        code: "STRIPE_CHECKOUT_PRICE_NOT_FOUND",
        userMessage: "プラン変更を開始できませんでした。",
        action: "時間をおいて、もう一度お試しください。",
        developerMessage: "Price ID not found for checkout",
      });
    }

    return await withCheckoutCreationLock(session.user.id, async (database) => {
      // Get or create Stripe customer
      let stripeCustomerId: string | undefined;
      let checkedOpenCheckoutSession = false;

      // Check if user already has a subscription with customer ID
      const [existingSubscription] = await database
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, session.user.id))
        .limit(1);

    // Block checkout if user already has a non-terminal subscription.
    if (
      existingSubscription?.status &&
      hasNonTerminalSubscriptionStatus(existingSubscription.status)
    ) {
      return createApiErrorResponse(req, {
        status: 409,
        code: "STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION",
        userMessage: "既存のプラン手続きがあります。請求管理ページから確認してください。",
        action: "設定画面の「請求管理」から、支払い状況やプラン変更を確認してください。",
        developerMessage: "User already has a non-terminal subscription; use the billing portal for changes",
      });
    }

    // Also check Stripe API for non-terminal subscriptions (handles concurrent POST before webhook fires).
    if (existingSubscription?.stripeCustomerId) {
      await assertOwnedStripeCustomer(session.user.id, existingSubscription.stripeCustomerId);

      const stripeSubscriptions = await stripe.subscriptions.list({
        customer: existingSubscription.stripeCustomerId,
        status: "all",
        limit: 100,
      });
      const nonTerminalSubscription = findNonTerminalStripeSubscription(stripeSubscriptions.data);

      if (nonTerminalSubscription) {
        return createApiErrorResponse(req, {
          status: 409,
          code: "STRIPE_CHECKOUT_ACTIVE_SUBSCRIPTION",
          userMessage: "既存のプラン手続きがあります。請求管理ページから確認してください。",
          action: "設定画面の「請求管理」から、支払い状況やプラン変更を確認してください。",
          developerMessage: `Stripe customer already has a non-terminal subscription: ${nonTerminalSubscription.status}`,
        });
      }

      const openCheckoutDecision = await findOpenCheckoutSession(
        existingSubscription.stripeCustomerId,
        plan,
        period,
      );
      checkedOpenCheckoutSession = true;
      if (openCheckoutDecision.kind === "reuse") {
        return NextResponse.json({
          url: openCheckoutDecision.session.url,
          sessionId: openCheckoutDecision.session.id,
          reused: true,
        });
      }
      if (openCheckoutDecision.kind === "conflict") {
        return createApiErrorResponse(req, {
          status: 409,
          code: "STRIPE_CHECKOUT_PENDING_SESSION",
          userMessage: "進行中の決済手続きがあります。",
          action: "開いている決済画面を完了するか、しばらく時間をおいてからもう一度お試しください。",
          developerMessage: `Stripe customer already has an open checkout session: ${openCheckoutDecision.session.id}`,
        });
      }
    }

    if (existingSubscription?.stripeCustomerId) {
      stripeCustomerId = existingSubscription.stripeCustomerId;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: session.user.email!,
        metadata: {
          userId: session.user.id,
        },
      });
      stripeCustomerId = customer.id;
      stripeCustomerId = await persistStripeCustomerId(database, session.user.id, stripeCustomerId);
    }

    if (!checkedOpenCheckoutSession) {
      const openCheckoutDecision = await findOpenCheckoutSession(stripeCustomerId, plan, period);
      if (openCheckoutDecision.kind === "reuse") {
        return NextResponse.json({
          url: openCheckoutDecision.session.url,
          sessionId: openCheckoutDecision.session.id,
          reused: true,
        });
      }
      if (openCheckoutDecision.kind === "conflict") {
        return createApiErrorResponse(req, {
          status: 409,
          code: "STRIPE_CHECKOUT_PENDING_SESSION",
          userMessage: "進行中の決済手続きがあります。",
          action: "開いている決済画面を完了するか、しばらく時間をおいてからもう一度お試しください。",
          developerMessage: `Stripe customer already has an open checkout session: ${openCheckoutDecision.session.id}`,
        });
      }
    }

    // Create checkout session
    //
    // 改正特商法 12 条の 6（最終確認画面の表示義務）対応:
    //   docs/release/INDIVIDUAL_BUSINESS_COMPLIANCE.md §6-2 に従い、
    //   Stripe Checkout の最終確認画面で以下を明示する:
    //     - 自動更新サブスクリプションである旨
    //     - 解約方法と次回更新日までの利用可
    //     - 返金ポリシーの要約
    //     - 利用規約 / 特商法ページへの同意
    //
    // なお `consent_collection.terms_of_service: "required"` を有効にするには、
    // Stripe Dashboard → Settings → Public details で Terms of service URL
    // (https://www.shupass.jp/terms) を設定しておく必要がある。未設定のまま
    // この API を呼ぶと Stripe 側で 400 エラーが返るため、本番デプロイ前に
    // 必ず Dashboard 側の設定を完了させること。
    const timeBucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const idempotencyKey = createHash("sha256")
      .update(`checkout:${session.user.id}:${stripeCustomerId}:${plan}:${period}:${timeBucket}`)
      .digest("hex");

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      locale: "ja",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?checkout=return&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: cancelUrl,
      metadata: {
        userId: session.user.id,
        plan: plan,
        period: period,
      },
      subscription_data: {
        description:
          "就活Pass サブスクリプション（自動更新・いつでも解約可能）",
        metadata: {
          userId: session.user.id,
          plan: plan,
        },
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address collection
      billing_address_collection: "auto",
      // 改正特商法 12 条の 6: 最終確認画面で自動更新・解約・返金方針を明示
      custom_text: {
        submit: {
          message:
            "本サービスは月額または年額の自動更新サブスクリプションです。お申込み時に即時決済され、以後は更新日に自動請求されます。解約はアプリ内の設定画面または Stripe カスタマーポータルからいつでも可能で、次回更新日までは引き続きご利用いただけます。デジタルサービスの性質上、法令上必要な場合を除き返金はいたしません。ただし、二重課金・誤課金・当社の責めに帰すべき提供不能が確認された場合は、利用規約に従って返金等の対応を行います。詳細は特定商取引法に基づく表記 (https://www.shupass.jp/legal) をご確認ください。",
        },
        terms_of_service_acceptance: {
          message:
            "チェックを入れて申込むことで、[利用規約](https://www.shupass.jp/terms)および[特定商取引法に基づく表記](https://www.shupass.jp/legal)に同意します。",
        },
      },
      // 利用規約への同意チェックボックスを必須化
      // 前提: Stripe Dashboard → Settings → Public details で
      //       Terms of service URL が設定されていること
      consent_collection: {
        terms_of_service: "required",
      },
    }, { idempotencyKey });

      return NextResponse.json({
        url: checkoutSession.url,
        sessionId: checkoutSession.id,
      });
    });
  } catch (error) {
    if (error instanceof StripeCheckoutCustomerError) {
      return createApiErrorResponse(req, {
        status: error.status,
        code: error.code,
        userMessage: error.userMessage,
        action: error.action,
        developerMessage: error.message,
      });
    }
    logError("stripe-checkout", error);
    return createApiErrorResponse(req, {
      status: 500,
      code: "STRIPE_CHECKOUT_CREATE_FAILED",
      userMessage: "プラン変更を開始できませんでした。",
      action: "時間をおいて、もう一度お試しください。",
      developerMessage: "Failed to create Stripe checkout session",
      error,
    });
  }
}
