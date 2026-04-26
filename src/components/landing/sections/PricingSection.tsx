import Link from "next/link";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";
import { Check } from "lucide-react";

const ASSET_BASE = "/marketing/LP/assets/";

const TRUST_PILLS = [
  { icon: "icons-circled/credit-card.png", label: "無料プランあり" },
  { icon: "icons-circled/shield-check.png", label: "クレカ登録不要" },
  { icon: "icons-circled/devices.png", label: "あとから変更OK" },
] as const;

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section
      id="pricing"
      className="py-20 lg:py-28"
      style={{ background: "var(--lp-pricing-gradient)" }}
    >
      <div className="relative mx-auto max-w-[1200px] px-6">
        {/* Decorative dot pattern -- hidden on mobile */}
        <div
          className="pointer-events-none absolute right-0 top-0 hidden lg:block"
          style={{ width: 200, height: 200, opacity: 0.1 }}
          aria-hidden="true"
        >
          <img
            src={`${ASSET_BASE}decorative/dot-pattern-3.png`}
            alt=""
            className="h-full w-full object-contain"
          />
        </div>

        {/* ---------- Heading ---------- */}
        <div className="mb-6 text-center">
          <h2
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontWeight: 800,
              lineHeight: 1.2,
              color: "var(--lp-navy)",
            }}
          >
            シンプルで始めやすい料金プラン
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-base"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.7 }}
          >
            まずは無料で試して、必要になったらアップグレード。
          </p>
        </div>

        {/* ---------- Trust Pills ---------- */}
        <div className="mb-12 mt-6 flex flex-wrap items-center justify-center gap-3">
          {TRUST_PILLS.map((pill) => (
            <span
              key={pill.label}
              className="flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium"
              style={{
                borderColor: "var(--lp-border-default)",
                color: "var(--lp-navy)",
              }}
            >
              {pill.icon ? (
                <img
                  src={`${ASSET_BASE}${pill.icon}`}
                  alt=""
                  className="h-5 w-5"
                />
              ) : null}
              {pill.label}
            </span>
          ))}
        </div>

        {/* ---------- Pricing Cards ---------- */}
        <div className="relative mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Decorative credit card -- left of cards, desktop only */}
          <img
            src={`${ASSET_BASE}pricing_assets_transparent/02_blue_credit_card_with_price_tag.png`}
            alt=""
            role="presentation"
            className="pointer-events-none absolute -left-16 top-[38%] hidden w-[100px] select-none opacity-80 lg:block"
          />
          <img
            src={`${ASSET_BASE}icons-circled/shield-check.png`}
            alt=""
            role="presentation"
            className="pointer-events-none absolute -left-10 top-[56%] hidden w-[60px] select-none opacity-70 lg:block"
          />
          {plans.map((plan) => {
            const isPopular = plan.isPopular === true;

            return (
              <div
                key={plan.id}
                className="relative flex flex-col rounded-2xl p-8"
                style={{
                  backgroundColor: isPopular ? "#ffffff" : "rgba(255,255,255,0.95)",
                  boxShadow: isPopular
                    ? "0 25px 50px -12px rgba(0,0,0,0.25)"
                    : "0 10px 25px -5px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
                  ...(isPopular
                    ? {
                        outline: "2px solid var(--lp-cta)",
                        outlineOffset: "-2px",
                        transform: "scale(1.03)",
                      }
                    : {}),
                }}
              >
                {/* "Recommended" badge for popular plan */}
                {isPopular ? (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-xs text-white"
                    style={{ fontWeight: 700, backgroundColor: "var(--lp-cta)" }}
                  >
                    おすすめ
                  </span>
                ) : null}

                {/* Plan name */}
                <h3
                  className="text-lg"
                  style={{ fontWeight: 700, color: "var(--lp-navy)" }}
                >
                  {plan.name}
                </h3>

                {/* Price */}
                <div className="mt-3 flex items-baseline gap-1">
                  <span
                    className="text-4xl tabular-nums"
                    style={{ fontWeight: 800, color: "var(--lp-navy)" }}
                  >
                    {plan.price}
                  </span>
                  <span
                    className="text-base font-medium"
                    style={{ color: "var(--lp-muted-text)" }}
                  >
                    /{plan.period || "月"}
                  </span>
                </div>

                {/* Daily price if exists */}
                {plan.dailyPrice ? (
                  <p className="mt-1 text-sm" style={{ color: "var(--lp-muted-text)" }}>
                    {plan.dailyPrice}
                  </p>
                ) : null}

                {/* Description */}
                <p className="mt-2 text-sm" style={{ color: "var(--lp-muted-text)" }}>
                  {plan.description}
                </p>

                {/* Divider */}
                <div className="my-5" style={{ borderTop: "1px solid var(--lp-border-default)" }} />

                {/* Features list */}
                <ul className="flex flex-grow flex-col space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{ color: "var(--lp-cta)" }}
                        strokeWidth={2.5}
                      />
                      <span style={{ color: "var(--lp-navy)" }}>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <div className="mt-6">
                  {isPopular ? (
                    <Link
                      href="/login"
                      className="block w-full rounded-xl py-3 text-center text-base text-white transition hover:opacity-90"
                      style={{ fontWeight: 700, backgroundColor: "var(--lp-cta)" }}
                    >
                      {plan.ctaLabel}
                    </Link>
                  ) : (
                    <Link
                      href={plan.id === "free" ? "/login" : "/pricing"}
                      className="block w-full rounded-xl py-3 text-center text-base transition hover:opacity-80"
                      style={{
                        fontWeight: 700,
                        color: "var(--lp-cta)",
                        border: "2px solid var(--lp-cta)",
                      }}
                    >
                      {plan.ctaLabel}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ---------- Bottom note ---------- */}
        <div
          className="mt-8 flex items-center justify-center gap-2 text-sm"
          style={{ color: "var(--lp-muted-text)" }}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
          <span>就活Passは、まず無料で使い始められます。</span>
        </div>
      </div>
    </section>
  );
}
