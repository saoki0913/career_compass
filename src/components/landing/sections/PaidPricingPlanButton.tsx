"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import type { MarketingPricingPlan } from "@/lib/marketing/pricing-plans";
import { usePricingPlanSelection } from "@/hooks/usePricingPlanSelection";

type PaidPricingPlanButtonProps = {
  plan: MarketingPricingPlan & { id: "standard" | "pro" };
  popular: boolean;
};

const paidCtaLabels = {
  standard: "Standardを選んで進む",
  pro: "Proを選んで進む",
} as const;

export function PaidPricingPlanButton({ plan, popular }: PaidPricingPlanButtonProps) {
  const { error, isBusy, selectedPlan, selectPlan } = usePricingPlanSelection({
    intentSource: "lp-pricing",
    analyticsSource: "lp-pricing",
  });
  const isThisBusy = isBusy && selectedPlan === plan.id;

  return (
    <div className="mt-7">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => void selectPlan(plan.id, "monthly")}
        className="inline-flex min-h-[60px] w-full items-center justify-center gap-4 rounded-full border-2 px-6 text-[18px] font-black transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
        style={{
          borderColor: "var(--lp-cta)",
          background: popular ? "var(--lp-cta)" : "#fff",
          color: popular ? "#fff" : "var(--lp-cta)",
        }}
      >
        {paidCtaLabels[plan.id]}
        {isThisBusy ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="h-6 w-6" aria-hidden />
        )}
      </button>
      {error ? (
        <p className="mt-3 text-center text-[13px] font-bold leading-6" style={{ color: "var(--lp-navy)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
