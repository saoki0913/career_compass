import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";
import { ScrollReveal } from "./ScrollReveal";

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");
  const recommendedPlan = plans.find((plan) => plan.isPopular) ?? plans[1] ?? plans[0];
  const secondaryPlans = plans.filter((plan) => plan.id !== recommendedPlan.id);

  return (
    <section id="pricing" className="scroll-mt-24 py-32 lg:scroll-mt-28 lg:py-40">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mx-auto mb-14 max-w-3xl text-center lg:mb-18">
            <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
              Pricing
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
              無料で始めて、
              必要なぶんだけ広げる。
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-slate-600">
              まずは無料プランで流れを確かめて、必要になったら Standard や Pro に切り替えられます。
              クレジットは成功した時だけ消費されるので、無駄なく使えます。
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.06}>
          <div className="mb-8 grid gap-4 border-y border-slate-200/80 py-5 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Free start
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">クレジットカード不要</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Fair usage
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">成功した時だけ消費</p>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
            <div className="rounded-[34px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(245,249,255,0.95),rgba(255,255,255,0.94))] p-8 shadow-[0_32px_90px_-62px_rgba(15,23,42,0.22)] sm:p-10">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold tracking-tight text-slate-950">
                  {recommendedPlan.name}
                </h3>
                <span className="rounded-full border border-primary/14 bg-primary/8 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                  Recommended
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">
                {recommendedPlan.description}
              </p>

              <div className="mt-7 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-tight text-slate-950">
                  {recommendedPlan.price}
                </span>
                <span className="pb-1 text-sm text-slate-500">
                  {recommendedPlan.period ? `/${recommendedPlan.period}` : ""}
                </span>
              </div>

              {recommendedPlan.dailyPrice ? (
                <p className="mt-2 text-xs text-slate-500">{recommendedPlan.dailyPrice}</p>
              ) : null}

              <ul className="mt-8 space-y-3.5">
                {recommendedPlan.features.slice(0, 5).map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm leading-6 text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button asChild className="landing-cta-primary mt-8 h-12 w-full rounded-full">
                <Link href="/pricing">{recommendedPlan.ctaLabel}</Link>
              </Button>
            </div>

            <div className="grid gap-4">
              {secondaryPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex flex-col gap-4 rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_22px_64px_-52px_rgba(15,23,42,0.18)] sm:flex-row sm:items-end sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-slate-950">
                      {plan.name}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{plan.description}</p>
                    <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
                      {plan.price}
                      <span className="ml-1 text-sm font-normal text-slate-500">
                        {plan.period ? `/${plan.period}` : ""}
                      </span>
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="landing-cta-secondary h-11 rounded-full px-5"
                  >
                    <Link href={plan.id === "free" ? "/login" : "/pricing"}>
                      {plan.ctaLabel}
                    </Link>
                  </Button>
                </div>
              ))}

              <p className="text-sm font-medium text-slate-500">
                年額プランと細かい比較表は pricing page に掲載。クレジットは成功時のみ消費されます。
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
