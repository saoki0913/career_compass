"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { reportUserFacingError } from "@/lib/client-error-ui";
import { parseApiErrorResponse } from "@/lib/api-errors";
import { trackEvent } from "@/lib/analytics/client";
import type { BillingPeriod, PlanType } from "@/lib/billing/plan-metadata";
import {
  PRICING_CHECKOUT_PATH,
  createPricingIntent,
  getPricingSelectionAction,
  isPaidPlanType,
  tryClearPricingIntent,
  trySavePricingIntent,
  type PaidPlanType,
  type PricingIntentSource,
} from "@/lib/billing/pricing-flow";

type CheckoutResponse = {
  url?: unknown;
};

type PricingPlanSelectionOptions = {
  intentSource: PricingIntentSource;
  analyticsSource?: string;
  reason?: string;
};

type PricingSelectionContext = {
  intentSource?: PricingIntentSource;
  analyticsSource?: string;
  reason?: string;
};

type ResolvedPricingSelectionContext = {
  intentSource: PricingIntentSource;
  analyticsSource: string;
  reason?: string;
};

function getCurrentPlan(plan: string | null | undefined): PlanType | null {
  if (plan === "free" || plan === "standard" || plan === "pro") {
    return plan;
  }
  return null;
}

function readCheckoutUrl(data: CheckoutResponse): string | null {
  return typeof data.url === "string" && data.url.length > 0 ? data.url : null;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json();
  return data && typeof data === "object" ? data as Record<string, unknown> : {};
}

export function usePricingPlanSelection({
  intentSource,
  analyticsSource = intentSource,
  reason,
}: PricingPlanSelectionOptions) {
  const router = useRouter();
  const { isAuthenticated, isLoading, userPlan } = useAuth();
  const [isRoutePending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isBusyRef = useRef(false);

  const currentPlan = getCurrentPlan(userPlan?.plan);
  const hasActiveSubscription = userPlan?.hasActiveSubscription ?? false;
  const isBusy = isLoading || isSubmitting || isRoutePending;

  const openBillingPortal = useCallback(async (sourceForAnalytics: string): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        throw await parseApiErrorResponse(response, {
          code: "STRIPE_PORTAL_CREATE_FAILED",
          userMessage: "請求管理ページを開けませんでした。",
          action: "時間をおいて、もう一度お試しください。",
        }, "PricingPlanSelection:openBillingPortal");
      }
      const data = await readJsonObject(response);
      const url = readCheckoutUrl(data);
      if (!url) {
        throw new Error("請求管理ページを開けませんでした");
      }
      trackEvent("portal_opened", { source: sourceForAnalytics, currentPlan: currentPlan ?? "unknown" });
      tryClearPricingIntent(window.sessionStorage);
      window.location.href = url;
      return true;
    } catch (portalError) {
      setError(reportUserFacingError(portalError, {
        code: "STRIPE_PORTAL_CREATE_FAILED",
        userMessage: "請求管理ページを開けませんでした。",
      }, "PricingPlanSelection:openBillingPortal"));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPlan]);

  const handleCheckout = useCallback(async (
    plan: PaidPlanType,
    period: BillingPeriod,
    context: ResolvedPricingSelectionContext,
  ): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          period,
          cancelSource: context.intentSource === "lp-pricing" ? "lp-pricing" : undefined,
        }),
      });

      if (!response.ok) {
        throw await parseApiErrorResponse(response, {
          code: "STRIPE_CHECKOUT_CREATE_FAILED",
          userMessage: "プラン変更を開始できませんでした。",
          action: "時間をおいて、もう一度お試しください。",
        }, "PricingPlanSelection:checkout");
      }
      const data = await readJsonObject(response);

      const url = readCheckoutUrl(data);
      if (url) {
        trackEvent("checkout_start", { plan, period, source: context.analyticsSource, reason: context.reason });
        tryClearPricingIntent(window.sessionStorage);
        window.location.href = url;
        return true;
      }
      return false;
    } catch (checkoutError) {
      setError(reportUserFacingError(checkoutError, {
        code: "STRIPE_CHECKOUT_CREATE_FAILED",
        userMessage: "プラン変更を開始できませんでした。",
      }, "PricingPlanSelection:checkout"));
      trackEvent("checkout_error", { plan, period, source: context.analyticsSource, reason: context.reason });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const selectPlan = useCallback(async (
    planId: PlanType,
    billingPeriod: BillingPeriod,
    context?: PricingSelectionContext,
  ): Promise<boolean> => {
    if (isBusyRef.current || isLoading) return false;
    isBusyRef.current = true;
    setSelectedPlan(planId);
    const effectiveContext = {
      intentSource: context?.intentSource ?? intentSource,
      analyticsSource: context?.analyticsSource ?? analyticsSource,
      reason: context?.reason ?? reason,
    };

    const action = getPricingSelectionAction({
      currentPlan,
      targetPlan: planId,
      isAuthenticated,
      hasActiveSubscription,
      subscriptionStatus: userPlan?.subscriptionStatus,
    });

    if (action === "dashboard") {
      tryClearPricingIntent(window.sessionStorage);
      startTransition(() => { router.push("/dashboard"); });
      return true;
    }

    if (action === "free") {
      tryClearPricingIntent(window.sessionStorage);
      startTransition(() => {
        router.push(isAuthenticated ? "/dashboard" : "/login?redirect=/dashboard");
      });
      return true;
    }

    if (action === "login") {
      if (isPaidPlanType(planId)) {
        const saved = trySavePricingIntent(window.sessionStorage, createPricingIntent({
          plan: planId,
          period: billingPeriod,
          source: effectiveContext.intentSource,
          reason: effectiveContext.reason,
        }));
        if (!saved) {
          setError("ブラウザの保存領域を確認できませんでした。ログイン後にもう一度プランを選択してください。");
          isBusyRef.current = false;
          return false;
        }
      }
      trackEvent("checkout_intent_login", {
        plan: planId,
        period: billingPeriod,
        source: effectiveContext.analyticsSource,
        reason: effectiveContext.reason,
      });
      startTransition(() => {
        router.push(`/login?redirect=${encodeURIComponent(PRICING_CHECKOUT_PATH)}`);
      });
      return true;
    }

    if (action === "portal") {
      const navigated = await openBillingPortal(effectiveContext.analyticsSource);
      if (!navigated) isBusyRef.current = false;
      return navigated;
    }

    if (!isPaidPlanType(planId)) {
      isBusyRef.current = false;
      return false;
    }

    const navigated = await handleCheckout(planId, billingPeriod, effectiveContext);
    if (!navigated) isBusyRef.current = false;
    return navigated;
  }, [
    analyticsSource,
    currentPlan,
    handleCheckout,
    hasActiveSubscription,
    intentSource,
    isAuthenticated,
    isLoading,
    openBillingPortal,
    reason,
    router,
    startTransition,
    userPlan?.subscriptionStatus,
  ]);

  return {
    currentPlan,
    error,
    isBusy,
    isLoading,
    selectedPlan,
    selectPlan,
  };
}
