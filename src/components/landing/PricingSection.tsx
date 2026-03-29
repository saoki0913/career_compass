import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";
import { ScrollReveal } from "./ScrollReveal";

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section id="pricing" className="scroll-mt-24 py-28 lg:scroll-mt-28 lg:py-36">
      <div className="mx-auto max-w-6xl px-4">
        <ScrollReveal>
          <div className="mx-auto mb-14 max-w-3xl text-center lg:mb-20">
            <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
              Pricing
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl lg:text-5xl">
              無料で始めて、
              必要なぶんだけ広げる。
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-8 text-slate-600">
              まずは無料プランで試して、必要になったらStandardやProに切り替え。クレジットは成功時のみ消費されるので、無駄がありません。
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.08}>
          <div className="rounded-[36px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(239,246,255,0.72))] p-5 shadow-[0_34px_100px_-72px_rgba(37,99,235,0.34)] sm:p-8">
            <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
              {plans.map((plan) => {
                const isPopular = plan.isPopular;

                return (
                  <div
                    key={plan.id}
                    className={[
                      "relative flex h-full flex-col rounded-[28px] border p-7",
                      isPopular
                        ? "border-primary/25 bg-white shadow-[0_24px_60px_-42px_rgba(37,99,235,0.4)] lg:-translate-y-2"
                        : "border-slate-200/80 bg-white/76 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.28)]",
                    ].join(" ")}
                  >
                    {isPopular ? (
                      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.32)]">
                        最も人気
                      </span>
                    ) : null}

                    <div className="mb-6">
                      <p className="text-sm font-semibold text-slate-600">
                        {plan.name}
                      </p>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="text-5xl font-bold tracking-tight text-slate-950">
                          {plan.price}
                        </span>
                        {plan.period ? (
                          <span className="text-lg text-slate-500">
                            /{plan.period}
                          </span>
                        ) : null}
                      </div>
                      {plan.dailyPrice ? (
                        <p className="mt-1 text-xs text-slate-400">
                          {plan.dailyPrice}
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-slate-600">
                        {plan.description}
                      </p>
                    </div>

                    <ul className="mb-8 flex-1 space-y-3">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-3"
                        >
                          <Check
                            className={[
                              "mt-0.5 size-4 shrink-0",
                              isPopular ? "text-primary" : "text-slate-400",
                            ].join(" ")}
                          />
                          <span className="text-sm leading-6 text-slate-600">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      asChild
                      variant={isPopular ? "default" : plan.id === "pro" ? "default" : "outline"}
                      className={[
                        "mt-auto h-12 w-full rounded-full font-semibold",
                        isPopular
                          ? "landing-cta-primary"
                          : plan.id === "pro"
                            ? "bg-slate-950 text-white hover:bg-slate-800"
                            : "landing-cta-secondary",
                      ].join(" ")}
                    >
                      <Link href={plan.id === "free" ? "/login" : "/pricing"}>
                        {plan.ctaLabel}
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.14}>
          <p className="mt-8 text-center text-sm font-medium text-slate-500">
            年額プランと詳細な比較は料金ページに掲載しています。
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
