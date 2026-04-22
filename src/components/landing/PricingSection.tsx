import { Check } from "lucide-react";
import Link from "next/link";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";
import { LandingSectionMotion } from "./LandingSectionMotion";

const planAudienceNotes: Record<"free" | "standard" | "pro", string> = {
  free: "まず試したい方",
  standard: "本格的に就活対策したい方",
  pro: "複数企業を並行で対策したい方",
};

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section className="bg-white px-6 py-24 md:py-32" id="pricing">
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion>
          <div className="mb-14 text-center md:mb-16">
            <h2
              className="mb-3 text-3xl tracking-tight text-[var(--lp-navy)] md:text-[2.5rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              シンプルな料金プラン
            </h2>
            <p className="mx-auto max-w-xl text-slate-500" style={{ lineHeight: 1.7 }}>
              用途に合わせて選べる3プラン。いつでもアップグレード・ダウングレード可能です。
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3 md:gap-5 lg:gap-6">
            {plans.map((plan) => {
              const isHighlighted = plan.isPopular;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-8 ${isHighlighted ? "text-white" : "bg-white"}`}
                  style={{
                    borderColor: isHighlighted
                      ? "var(--lp-navy)"
                      : "var(--lp-border-default)",
                    backgroundColor: isHighlighted
                      ? "var(--lp-navy)"
                      : "#ffffff",
                    boxShadow: isHighlighted
                      ? "0 20px 80px rgba(10,15,92,0.08)"
                      : undefined,
                  }}
                >
                  {isHighlighted ? (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[10px] uppercase tracking-widest text-[var(--lp-navy)]"
                      style={{ fontWeight: 700 }}
                    >
                      Popular
                    </div>
                  ) : null}

                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3
                      className={`text-lg ${isHighlighted ? "text-white" : "text-[var(--lp-navy)]"}`}
                      style={{ fontWeight: 700 }}
                    >
                      {plan.name}
                    </h3>
                    {plan.id === "free" ? (
                      <span
                        className="rounded-full bg-[var(--lp-badge-bg)] px-2 py-0.5 text-[10px] text-[var(--lp-navy)]"
                        style={{ fontWeight: 700 }}
                      >
                        カード登録不要
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`mb-3 text-xs ${isHighlighted ? "text-white/70" : "text-slate-500"}`}
                  >
                    {planAudienceNotes[plan.id]}
                  </p>

                  <div className="mb-1 flex items-baseline gap-1">
                    <span
                      className={`text-3xl tabular-nums ${isHighlighted ? "text-white" : "text-[var(--lp-navy)]"}`}
                      style={{ fontWeight: 700 }}
                    >
                      {plan.price}
                    </span>
                    {plan.period ? (
                      <span
                        className={
                          isHighlighted ? "text-white/75" : "text-slate-500"
                        }
                        style={{ fontSize: "0.875rem" }}
                      >
                        / {plan.period}
                      </span>
                    ) : null}
                  </div>

                  {plan.dailyPrice ? (
                    <p
                      className={`mb-6 text-sm ${isHighlighted ? "text-white/65" : "text-slate-500"}`}
                    >
                      {plan.dailyPrice}
                    </p>
                  ) : (
                    <p
                      className={`mb-6 text-sm ${isHighlighted ? "text-white/65" : "text-slate-500"}`}
                    >
                      {plan.description}
                    </p>
                  )}

                  <ul className="mb-8 flex flex-grow flex-col gap-3">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className={`flex items-start gap-2.5 text-sm ${isHighlighted ? "text-white/90" : "text-slate-500"}`}
                      >
                        <Check
                          className={`mt-0.5 h-4 w-4 shrink-0 ${isHighlighted ? "text-white" : "text-[var(--lp-success)]"}`}
                          strokeWidth={2.5}
                        />
                        <span style={{ fontWeight: 400 }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.id === "free" ? "/login" : "/pricing"}
                    className={`mt-auto w-full rounded-xl py-3 text-center text-sm transition ${isHighlighted ? "bg-white text-[var(--lp-navy)] hover:bg-white/95" : "border border-slate-200 text-[var(--lp-navy)] hover:bg-slate-50"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="text-sm text-[var(--lp-navy)] underline underline-offset-4 hover:opacity-80"
              style={{ fontWeight: 600 }}
            >
              料金の詳細を見る →
            </Link>
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
