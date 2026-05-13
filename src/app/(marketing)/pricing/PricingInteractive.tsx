"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/client";
import { getCheckoutAbandonState } from "@/lib/billing/url-state";
import {
  getMarketingPricingPlans,
  type MarketingPricingPlan,
} from "@/lib/marketing/pricing-plans";
import { ANNUAL_PLAN_PRICES, type BillingPeriod, type PlanType } from "@/lib/billing/plan-metadata";
import { cn } from "@/lib/utils";
import { usePricingPlanSelection } from "@/hooks/usePricingPlanSelection";

const PRO_MONTHLY = 2_980;

const PLAN_RANK: Record<string, number> = { free: 0, standard: 1, pro: 2 };

function getCtaLabel(
  planId: string,
  currentPlan: PlanType | null,
  defaultLabel: string,
): string {
  if (!currentPlan || currentPlan === planId) return defaultLabel;
  const currentRank = PLAN_RANK[currentPlan] ?? 0;
  const targetRank = PLAN_RANK[planId] ?? 0;
  if (targetRank > currentRank) return "アップグレード";
  return "プランを変更";
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
          <span>{isCurrent ? "利用中のプラン" : getCtaLabel(plan.id, currentPlan, plan.ctaLabel)}</span>
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

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const source = searchParams.get("source") || "pricing";
  const reason = searchParams.get("reason") || undefined;
  const {
    currentPlan,
    error,
    isBusy,
    selectedPlan,
    selectPlan,
  } = usePricingPlanSelection({
    intentSource: "pricing",
    analyticsSource: source,
    reason,
  });

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

  const handlePlanSelect = useCallback((planId: PlanType) => {
    void selectPlan(planId, billingPeriod);
  }, [billingPeriod, selectPlan]);

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
