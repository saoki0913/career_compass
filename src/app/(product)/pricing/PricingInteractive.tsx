"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/client";
import { getPricingSelectionAction } from "@/lib/billing/pricing-flow";
import { getCheckoutAbandonState } from "@/lib/billing/url-state";
import {
  getMarketingPricingPlans,
  type MarketingPricingPlan,
} from "@/lib/marketing/pricing-plans";
import { ANNUAL_PLAN_PRICES, type BillingPeriod } from "@/lib/billing/plan-metadata";
import { cn } from "@/lib/utils";
import { reportUserFacingError } from "@/lib/client-error-ui";

type PlanType = "free" | "standard" | "pro";

const PRO_MONTHLY = 2_980;

function getCurrentPlan(plan: string | null | undefined): PlanType | null {
  if (!plan) return null;
  const normalized = plan.toLowerCase();
  return normalized === "free" || normalized === "standard" || normalized === "pro"
    ? normalized
    : null;
}

function PricingPlanCard({
  plan,
  billingPeriod,
  selectedPlan,
  currentPlan,
  isBusy,
  onSelect,
}: {
  plan: MarketingPricingPlan;
  billingPeriod: BillingPeriod;
  selectedPlan: PlanType | null;
  currentPlan: PlanType | null;
  isBusy: boolean;
  onSelect: (plan: PlanType) => void;
}) {
  const isRecommended = plan.id === "standard";
  const isSelected = selectedPlan === plan.id;
  const isCurrent = currentPlan === plan.id;
  const isAnnual = billingPeriod === "annual";

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-white p-6 shadow-sm transition-colors duration-200",
        isRecommended ? "border-primary/40 bg-primary/[0.02]" : "border-slate-200",
        isSelected && "ring-2 ring-primary/25",
        isCurrent && "border-primary/35"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase",
                isRecommended
                  ? "bg-primary text-primary-foreground shadow-[0_14px_30px_-18px_rgba(37,99,235,0.5)]"
                  : "border border-slate-200 bg-white text-slate-600"
              )}
            >
              {plan.name}
            </span>
            {isRecommended ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                最も選ばれています
              </span>
            ) : null}
            {isCurrent ? (
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                現在利用中
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-sm leading-6 text-slate-600">{plan.description}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-end gap-2">
        <span className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
          {plan.price}
        </span>
        {plan.period ? (
          <span className="pb-1 text-sm text-slate-500">/{plan.period}</span>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {plan.originalPrice ? (
          <p className="text-slate-500">
            <span className="line-through">{plan.originalPrice}/月</span>
            {plan.savingsNote ? (
              <span className="ml-2 font-semibold text-primary">{plan.savingsNote}</span>
            ) : null}
          </p>
        ) : null}
        {plan.dailyPrice ? (
          <p className="font-medium text-slate-700">{plan.dailyPrice}</p>
        ) : null}
        {!isAnnual && plan.id === "free" ? (
          <p className="text-slate-500">カード不要で始められます</p>
        ) : null}
      </div>

      <ul className="mt-8 space-y-3 border-t border-slate-200/80 pt-6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm text-slate-700">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950/[0.04] text-slate-700">
              <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Button
          size="lg"
          className={cn(
            "w-full justify-between rounded-2xl text-sm font-semibold",
            isRecommended
              ? "border border-primary/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] text-white"
              : undefined
          )}
          disabled={isBusy}
          onClick={() => onSelect(plan.id)}
        >
          <span>{isCurrent ? "プランを確認する" : plan.ctaLabel}</span>
          {isBusy && isSelected ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </Button>
      </div>
    </article>
  );
}

export function PricingInteractive() {
  return (
    <Suspense>
      <PricingInteractiveContent />
    </Suspense>
  );
}

function PricingInteractiveContent() {
  const searchParams = useSearchParams();
  const { canceled } = getCheckoutAbandonState(searchParams);
  const router = useRouter();
  const { isAuthenticated, isLoading, userPlan } = useAuth();
  const [isRoutePending, startTransition] = useTransition();

  const isBusyRef = useRef(false);

  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>("standard");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = getCurrentPlan(userPlan?.plan);
  const isBusy = isSubmitting || isRoutePending;
  const source = searchParams.get("source") || "pricing";
  const reason = searchParams.get("reason") || undefined;

  const plans = useMemo(() => getMarketingPricingPlans(billingPeriod), [billingPeriod]);
  const maxSavings = `¥${(PRO_MONTHLY * 12 - ANNUAL_PLAN_PRICES.pro).toLocaleString("ja-JP")}`;

  useEffect(() => {
    trackEvent("pricing_view", { source, reason });
  }, [reason, source]);

  useEffect(() => {
    if (!canceled) return;
    trackEvent("checkout_abandon", {
      source,
      reason,
    });
  }, [canceled, reason, source]);

  const handleCheckout = useCallback(async (plan: PlanType, period: BillingPeriod): Promise<boolean> => {
    if (plan === "free") return false;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "チェックアウトの作成に失敗しました");
      }

      if (data.url) {
        trackEvent("checkout_start", { plan, period, source, reason });
        window.location.href = data.url;
        return true;
      }
      return false;
    } catch (checkoutError) {
      setError(reportUserFacingError(checkoutError, {
        code: "STRIPE_CHECKOUT_CREATE_FAILED",
        userMessage: "プラン変更を開始できませんでした。",
      }, "PricingPage:checkout"));
      trackEvent("checkout_error", { plan, period, source, reason });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [reason, source]);

  const openBillingPortal = useCallback(async (): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "請求管理ページを開けませんでした");
      }
      trackEvent("portal_opened", { source: "pricing", currentPlan: currentPlan ?? "unknown" });
      window.location.href = data.url;
      return true;
    } catch (portalError) {
      setError(reportUserFacingError(portalError, {
        code: "STRIPE_PORTAL_CREATE_FAILED",
        userMessage: "請求管理ページを開けませんでした。",
      }, "PricingPage:openBillingPortal"));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPlan]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const savedPlan = localStorage.getItem("selectedPlan") as PlanType | null;
    const savedPeriod = (localStorage.getItem("selectedPlanPeriod") || "monthly") as BillingPeriod;
    if (!savedPlan || savedPlan === "free") return;

    localStorage.removeItem("selectedPlan");
    localStorage.removeItem("selectedPlanPeriod");
    setBillingPeriod(savedPeriod);
    void handleCheckout(savedPlan, savedPeriod);
  }, [handleCheckout, isAuthenticated, isLoading]);

  const handlePlanSelect = useCallback(async (planId: PlanType) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    setSelectedPlan(planId);
    const action = getPricingSelectionAction({
      currentPlan,
      targetPlan: planId,
      isAuthenticated,
    });

    if (action === "dashboard") {
      startTransition(() => { router.push("/dashboard"); });
      return;
    }

    if (action === "free") {
      startTransition(() => {
        router.push(isAuthenticated ? "/dashboard" : "/login?redirect=/dashboard");
      });
      return;
    }

    if (action === "login") {
      localStorage.setItem("selectedPlan", planId);
      localStorage.setItem("selectedPlanPeriod", billingPeriod);
      trackEvent("checkout_intent_login", { plan: planId, period: billingPeriod });
      startTransition(() => { router.push("/login?redirect=/pricing"); });
      return;
    }

    if (action === "portal") {
      const navigated = await openBillingPortal();
      if (!navigated) isBusyRef.current = false;
      return;
    }

    const navigated = await handleCheckout(planId, billingPeriod);
    if (!navigated) isBusyRef.current = false;
  }, [
    billingPeriod,
    currentPlan,
    handleCheckout,
    isAuthenticated,
    openBillingPortal,
    router,
    startTransition,
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8 pt-4 sm:px-6">
      {canceled ? (
        <div className="mb-6 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-800">
          チェックアウトがキャンセルされました。プラン内容を見直してから、いつでも再開できます。
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-800">
          {error}
        </div>
      ) : null}

      <section className="mb-6 border-b border-slate-200/80 pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-center text-lg font-semibold tracking-tight text-slate-950 sm:text-left sm:text-xl">
            就活の進行量に合わせて、無理のないプランを選べます。
          </h1>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-center text-xs text-slate-600 sm:text-right">
              年額は最大<span className="font-semibold text-slate-950">{maxSavings}</span>お得
            </p>
            <div className="inline-flex self-center rounded-full border border-slate-200 bg-slate-50/80 p-0.5 sm:self-auto">
              <button
                type="button"
                onClick={() => setBillingPeriod("monthly")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  billingPeriod === "monthly"
                    ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.6)]"
                    : "text-slate-500 hover:text-slate-950"
                )}
              >
                月額
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod("annual")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                  billingPeriod === "annual"
                    ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.6)]"
                    : "text-slate-500 hover:text-slate-950"
                )}
              >
                年額
              </button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
          {plans.map((plan) => (
            <PricingPlanCard
              key={`${plan.id}-${billingPeriod}`}
              plan={plan}
              billingPeriod={billingPeriod}
              selectedPlan={selectedPlan}
              currentPlan={currentPlan}
              isBusy={isBusy}
              onSelect={(planId) => void handlePlanSelect(planId)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
