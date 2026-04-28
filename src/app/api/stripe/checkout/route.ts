/**
 * Stripe Checkout Session API
 *
 * POST: Create a checkout session for subscription
 * Body: { plan: "standard" | "pro", period?: "monthly" | "annual" }
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getPriceId, type PlanType, type BillingPeriod } from "@/lib/stripe/config";
import { getAppUrl } from "@/lib/app-url";
import { createApiErrorResponse } from "@/app/api/_shared/error-response";
import { logError } from "@/lib/logger";
import { getCsrfFailureReason } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  try {
    const csrfFailure = getCsrfFailureReason(req);
    if (csrfFailure) {
      return createApiErrorResponse(req, {
        status: 403,
        code: "CSRF_VALIDATION_FAILED",
        userMessage: "安全確認に失敗しました。ページを再読み込みして、もう一度お試しください。",
        developerMessage: `CSRF validation failed: ${csrfFailure}`,
      });
    }

    const appUrl = getAppUrl();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return createApiErrorResponse(req, {
        status: 401,
        code: "AUTH_REQUIRED",
        userMessage: "ログイン状態を確認して、もう一度お試しください。",
        developerMessage: "Authentication required",
      });
    }

    const body = await req.json();
    const plan = body.plan as PlanType;
    const period = (body.period || "monthly") as BillingPeriod;

    // Validate plan
    if (!plan || !["standard", "pro"].includes(plan)) {
      return createApiErrorResponse(req, {
        status: 400,
        code: "STRIPE_CHECKOUT_INVALID_PLAN",
        userMessage: "プランの選択内容を確認してください。",
        developerMessage: "Invalid plan selection",
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

    // Get or create Stripe customer
    let stripeCustomerId: string | undefined;

    // Check if user already has a subscription with customer ID
    const [existingSubscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);

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
      success_url: `${appUrl}/dashboard?success=true&plan=${plan}`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
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
            "本サービスは自動更新のサブスクリプションです。解約はアプリ内の設定画面または Stripe カスタマーポータルからいつでも可能で、次回更新日までは引き続きご利用いただけます。デジタルサービスの性質上、法令上必要な場合を除き返金はいたしません。詳細は特定商取引法に基づく表記 (https://www.shupass.jp/legal) をご確認ください。",
        },
        terms_of_service_acceptance: {
          message:
            "お申込みにより[利用規約](https://www.shupass.jp/terms)および[特定商取引法に基づく表記](https://www.shupass.jp/legal)に同意したものとみなされます。",
        },
      },
      // 利用規約への同意チェックボックスを必須化
      // 前提: Stripe Dashboard → Settings → Public details で
      //       Terms of service URL が設定されていること
      consent_collection: {
        terms_of_service: "required",
      },
    });

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
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
