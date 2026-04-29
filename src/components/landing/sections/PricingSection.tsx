import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, Star } from "lucide-react";
import { lpAsset } from "@/lib/marketing/lp-assets";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";

const TRUST_PILLS = ["無料プランあり", "クレカ登録不要", "あとから変更OK"] as const;

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-16 sm:py-20 lg:min-h-[790px]"
      style={{
        background: "var(--lp-pricing-gradient)",
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
      }}
    >
      <img
        src={lpAsset("shupass-v2/pricing/wave.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-70 lg:block"
      />
      <img
        src={lpAsset("shupass-v2/pricing/icon-card-y0.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[6%] top-[138px] hidden w-[112px] opacity-80 lg:block"
      />
      <img
        src={lpAsset("shupass-v2/pricing/icon-chart.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[6%] top-[128px] hidden w-[116px] opacity-75 lg:block"
      />
      <img
        src={lpAsset("shupass-v2/pricing/icon-doc-check.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[12%] bottom-[150px] hidden w-[82px] opacity-70 lg:block"
      />
      <img
        src={lpAsset("shupass-v2/pricing/dots.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[12%] top-[250px] hidden w-[110px] opacity-40 lg:block"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="text-center">
          <h2
            className="text-[34px] leading-[1.2] sm:text-[44px] lg:text-[46px]"
            style={{
              color: "var(--lp-navy)",
              fontWeight: 800,
              letterSpacing: "0",
            }}
          >
            シンプルで<span style={{ color: "var(--lp-cta)" }}>始めやすい</span>料金プラン
          </h2>
          <p
            className="mx-auto mt-4 max-w-2xl text-[16px] leading-[1.7]"
            style={{ color: "var(--lp-muted-text)" }}
          >
            まずは無料で試して、必要になったらアップグレード。
          </p>
        </div>

        <ul className="mt-7 flex flex-wrap items-center justify-center gap-4">
          {TRUST_PILLS.map((label) => (
            <li
              key={label}
              className="flex h-[44px] min-w-[178px] items-center justify-center gap-2 rounded-full border bg-white px-5 text-[14px] font-bold"
              style={{ borderColor: "var(--lp-border-default)", color: "var(--lp-cta)" }}
            >
              <Check className="h-5 w-5" strokeWidth={2.8} aria-hidden />
              {label}
            </li>
          ))}
        </ul>

        <div className="relative mx-auto mt-11 grid max-w-[1050px] grid-cols-1 gap-6 lg:grid-cols-[1fr_1.08fr_1fr] lg:items-start">
          {plans.map((plan) => {
            const isPopular = plan.isPopular === true;

            return (
              <article
                key={plan.id}
                className={`relative flex min-h-[500px] flex-col rounded-[22px] border bg-white p-7 ${
                  isPopular ? "lg:-translate-y-5" : ""
                }`}
                style={{
                  borderColor: isPopular ? "var(--lp-cta)" : "transparent",
                  boxShadow: isPopular
                    ? "0 22px 46px rgba(37, 99, 235, 0.18)"
                    : "0 18px 38px rgba(20, 50, 110, 0.09)",
                }}
              >
                {isPopular ? (
                  <span
                    className="absolute -top-6 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-6 py-3 text-[16px] text-white"
                    style={{ backgroundColor: "var(--lp-cta)", fontWeight: 800 }}
                  >
                    <Star className="h-4 w-4 fill-white" aria-hidden />
                    おすすめ
                  </span>
                ) : null}

                <h3
                  className="text-[34px] leading-none"
                  style={{ color: "var(--lp-navy)", fontWeight: 800 }}
                >
                  {plan.name}
                </h3>

                <div className="mt-6 flex items-baseline gap-2">
                  <span
                    className="text-[50px] leading-none tabular-nums"
                    style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                  >
                    {plan.price}
                  </span>
                  <span className="text-[18px] font-bold" style={{ color: "var(--lp-navy)" }}>
                    /{plan.period || "月"}
                  </span>
                </div>

                <p className="mt-3 text-[15px]" style={{ color: "var(--lp-navy)" }}>
                  {plan.description}
                </p>

                <div className="my-5" style={{ borderTop: "1px solid var(--lp-border-default)" }} />

                <ul className="flex flex-grow flex-col gap-3">
                  {plan.features.slice(0, 6).map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[14px]">
                      <span
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: isPopular ? "var(--lp-cta)" : "#ffffff",
                          color: isPopular ? "#ffffff" : "var(--lp-cta)",
                          border: "1.5px solid var(--lp-cta)",
                        }}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                      </span>
                      <span className="leading-[1.55]" style={{ color: "var(--lp-navy)" }}>
                        {feature.replace(/（.*?）/g, "")}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={isPopular || plan.id === "free" ? "/login" : "/pricing"}
                  className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full border py-3.5 text-center text-[15px] transition duration-200 hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    fontWeight: 800,
                    color: isPopular ? "#ffffff" : "var(--lp-cta)",
                    backgroundColor: isPopular ? "var(--lp-cta)" : "#ffffff",
                    borderColor: "var(--lp-cta)",
                    outlineColor: "rgba(37, 99, 235, 0.45)",
                  }}
                >
                  {plan.ctaLabel}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>

        <div
          className="mt-7 flex items-center justify-center gap-3 text-center text-[17px]"
          style={{ color: "var(--lp-navy)", fontWeight: 700 }}
        >
          <ShieldCheck className="h-7 w-7 shrink-0" style={{ color: "var(--lp-cta)" }} aria-hidden />
          <span>就活Passは、まず無料で使い始められます。</span>
        </div>
      </div>
    </section>
  );
}
