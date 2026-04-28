import Link from "next/link";
import { Check } from "lucide-react";
import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";

const ASSET_BASE = `${LP_ASSET_BASE}/`;

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
      className="relative min-h-[940px] overflow-hidden py-[72px]"
      style={{
        background: "var(--lp-pricing-gradient)",
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
      }}
    >
      <img
        src={`${ASSET_BASE}decorative/wave-line-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-40 2xl:block"
      />
      <img
        src={`${ASSET_BASE}pricing_assets_transparent/02_blue_credit_card_with_price_tag.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[6%] top-[148px] hidden w-[170px] opacity-85 2xl:block"
      />
      <img
        src={`${ASSET_BASE}pricing_assets_transparent/11_growth_trend_with_bar_chart_elements.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[6%] top-[135px] hidden w-[190px] opacity-75 2xl:block"
      />
      <img
        src={`${ASSET_BASE}decorative/dot-pattern-3.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[12%] top-[255px] hidden w-[150px] opacity-35 2xl:block"
      />

      <div className="relative mx-auto max-w-[1600px] px-5 sm:px-8 2xl:px-0">
        <div className="text-center">
          <h2
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(40px, 5vw, 66px)",
              fontWeight: 800,
              letterSpacing: "0",
              lineHeight: 1.18,
            }}
          >
            シンプルで始めやすい料金プラン
          </h2>
          <p
            className="mx-auto mt-5 max-w-3xl text-[22px]"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.7 }}
          >
            まずは無料で試して、必要になったらアップグレード。
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-9">
          {TRUST_PILLS.map((pill) => (
            <span
              key={pill.label}
              className="flex h-[62px] min-w-[276px] items-center justify-center gap-4 rounded-full border bg-white px-7 text-[21px] font-bold"
              style={{
                borderColor: "var(--lp-border-default)",
                color: "var(--lp-cta)",
              }}
            >
              <img
                src={`${ASSET_BASE}${pill.icon}`}
                alt=""
                role="presentation"
                className="h-8 w-8 object-contain"
              />
              {pill.label}
            </span>
          ))}
        </div>

        <div className="relative mx-auto mt-[58px] grid max-w-[1480px] grid-cols-1 gap-8 xl:grid-cols-3 xl:items-start 2xl:grid-cols-[436px_486px_436px] 2xl:justify-between">
          {plans.map((plan) => {
            const isPopular = plan.isPopular === true;

            return (
              <div
                key={plan.id}
                className={`relative flex min-h-[620px] flex-col rounded-[22px] border bg-white p-9 ${
                  isPopular ? "xl:-translate-y-6" : ""
                }`}
                style={{
                  borderColor: isPopular ? "var(--lp-cta)" : "transparent",
                  boxShadow: isPopular
                    ? "0 24px 52px rgba(0, 63, 180, 0.16)"
                    : "0 20px 42px rgba(0, 34, 104, 0.09)",
                }}
              >
                {isPopular ? (
                  <span
                    className="absolute -top-[34px] left-1/2 min-w-[210px] -translate-x-1/2 whitespace-nowrap rounded-full px-8 py-4 text-center text-[22px] text-white"
                    style={{ backgroundColor: "var(--lp-cta)", fontWeight: 800 }}
                  >
                    ★ おすすめ
                  </span>
                ) : null}

                <h3
                  className="text-[46px] leading-none"
                  style={{ color: "var(--lp-navy)", fontWeight: 800 }}
                >
                  {plan.name}
                </h3>

                <div className="mt-7 flex items-baseline gap-3">
                  <span
                    className="text-[72px] leading-none tabular-nums"
                    style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                  >
                    {plan.price}
                  </span>
                  <span
                    className="text-[24px] font-bold"
                    style={{ color: "var(--lp-navy)" }}
                  >
                    /{plan.period || "月"}
                  </span>
                </div>

                <p className="mt-4 text-[18px]" style={{ color: "var(--lp-navy)" }}>
                  {plan.description}
                </p>

                <div
                  className="my-6"
                  style={{ borderTop: "1px solid var(--lp-border-default)" }}
                />

                <ul className="flex flex-grow flex-col gap-3">
                  {plan.features.slice(0, 6).map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[15px]">
                      <Check
                        className="mt-0.5 h-5 w-5 shrink-0 rounded-full"
                        style={{ color: "var(--lp-cta)" }}
                        strokeWidth={2.7}
                      />
                      <span className="leading-[1.55]" style={{ color: "var(--lp-navy)" }}>
                        {feature.replace(/（.*?）/g, "")}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href={isPopular || plan.id === "free" ? "/login" : "/pricing"}
                    className="block w-full rounded-full py-4 text-center text-[19px] transition hover:opacity-90"
                    style={{
                      fontWeight: 800,
                      color: isPopular ? "#ffffff" : "var(--lp-cta)",
                      backgroundColor: isPopular ? "var(--lp-cta)" : "#ffffff",
                      border: isPopular ? "2px solid var(--lp-cta)" : "2px solid var(--lp-cta)",
                    }}
                  >
                    {plan.ctaLabel}　→
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="mt-7 flex items-center justify-center gap-4 text-[21px]"
          style={{ color: "var(--lp-navy)" }}
        >
          <img
            src={`${ASSET_BASE}icons-circled/shield-check.png`}
            alt=""
            role="presentation"
            className="h-12 w-12 object-contain"
          />
          <span>就活Passは、まず無料で使い始められます。</span>
        </div>
      </div>
    </section>
  );
}
