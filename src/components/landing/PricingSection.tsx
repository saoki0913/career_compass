import { Check } from "lucide-react";
import Link from "next/link";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section
      className="bg-[var(--lp-surface-section)] px-6 py-24 md:py-28"
      id="pricing"
    >
      <div className="mx-auto max-w-7xl">
        <LandingSectionMotion>
          <div className="mb-14 text-center md:mb-16">
            <h2
              className="mb-3 text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl"
              style={{ fontWeight: 600 }}
            >
              シンプルな料金プラン
            </h2>
            <p className="mx-auto max-w-xl text-base text-[var(--lp-body-muted)]">
              用途に合わせて選べる3プラン。いつでもアップグレード・ダウングレード可能です。
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3 md:gap-5 lg:gap-6">
            {plans.map((plan) => {
              const isHighlighted = plan.isPopular;

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-xl border p-8 ${isHighlighted ? "text-white" : "bg-white"}`}
                  style={{
                    borderColor: isHighlighted
                      ? "var(--lp-navy)"
                      : "var(--lp-border-default)",
                    backgroundColor: isHighlighted
                      ? "var(--lp-navy)"
                      : "#ffffff",
                    boxShadow: isHighlighted
                      ? "var(--lp-shadow-screenshot)"
                      : "var(--lp-shadow-card)",
                  }}
                >
                  {isHighlighted ? (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] uppercase tracking-widest text-white"
                      style={{
                        fontWeight: 700,
                        backgroundColor: "var(--lp-cta)",
                      }}
                    >
                      Popular
                    </div>
                  ) : null}

                  <h3
                    className={`mb-2 text-lg ${isHighlighted ? "text-white" : "text-[var(--lp-navy)]"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {plan.name}
                  </h3>

                  <div className="mb-1 flex items-baseline gap-1">
                    <span
                      className={`text-3xl tabular-nums ${isHighlighted ? "text-white" : "text-[var(--lp-navy)]"}`}
                      style={{ fontWeight: 600 }}
                    >
                      {plan.price}
                    </span>
                    {plan.period ? (
                      <span
                        className={
                          isHighlighted ? "text-white/75" : "text-[var(--lp-body-muted)]"
                        }
                        style={{ fontSize: "0.875rem" }}
                      >
                        / {plan.period}
                      </span>
                    ) : null}
                  </div>

                  {plan.dailyPrice ? (
                    <p
                      className={`mb-6 text-sm ${isHighlighted ? "text-white/65" : "text-[var(--lp-body-muted)]"}`}
                    >
                      {plan.dailyPrice}
                    </p>
                  ) : (
                    <p
                      className={`mb-6 text-sm ${isHighlighted ? "text-white/65" : "text-[var(--lp-body-muted)]"}`}
                    >
                      {plan.description}
                    </p>
                  )}

                  <ul className="mb-8 flex flex-grow flex-col gap-3">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className={`flex items-start gap-2.5 text-sm ${isHighlighted ? "text-white/90" : "text-[var(--lp-body-muted)]"}`}
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
                    className={`mt-auto w-full rounded-md py-3 text-center text-sm transition ${isHighlighted ? "bg-[var(--lp-cta)] text-white hover:opacity-90" : "border text-[var(--lp-navy)] hover:bg-[var(--lp-surface-muted)]"}`}
                    style={{
                      fontWeight: 600,
                      borderColor: isHighlighted ? undefined : "var(--lp-border-default)",
                      ...(isHighlighted
                        ? {}
                        : { borderWidth: "1px", borderStyle: "solid" }),
                    }}
                  >
                    {plan.ctaLabel}
                  </Link>
                </div>
              );
            })}
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
