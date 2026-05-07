import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Star } from "lucide-react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";

const pricingSparkles = [
  { x: 8, y: 10, size: 12, opacity: 0.3, color: "#b9d8ff" },
  { x: 88, y: 6, size: 14, opacity: 0.25, color: "#78b5ff" },
  { x: 12, y: 75, size: 10, opacity: 0.35, color: "#d3e5ff", type: "dot" as const },
  { x: 92, y: 68, size: 8, opacity: 0.3, color: "#b9d8ff", type: "dot" as const },
] as const;

const trustPills = ["無料プランあり", "必要な分だけ使える", "あとから変更OK"] as const;

function parsePrice(price: string) {
  const match = /^(¥)(.+)$/.exec(price);
  return match ? { currency: match[1], amount: match[2] } : { currency: "", amount: price };
}

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section
      id="pricing"
      data-section="pricing"
      className="relative scroll-mt-[92px] overflow-hidden"
      style={{
        padding: "62px 0 64px",
        background: "linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%)",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden>
        <circle cx="190" cy="170" r="86" fill="#e8f2ff" />
        <circle cx="1505" cy="150" r="118" fill="#e8f2ff" />
        <path d="M0 394 C160 178 250 326 320 72" fill="none" stroke="#b9d8ff" strokeWidth="2" />
        <path d="M0 780 C220 858 352 792 515 842 C730 910 850 782 1060 842 C1270 902 1460 834 1672 760" fill="none" stroke="#b9d8ff" strokeWidth="2" />
        <path d="M0 842 C260 930 360 832 520 886 C720 956 884 824 1090 890 C1300 956 1475 878 1672 820" fill="none" stroke="#d1e4ff" strokeWidth="1.5" />
      </svg>

      <img src={lpSectionAsset("pricing/image_01_nobg.png")} alt="" role="presentation" className="pointer-events-none absolute left-[112px] top-[132px] hidden w-[120px] lg:block" />
      <img src={lpSectionAsset("pricing/image_09_nobg.png")} alt="" role="presentation" className="pointer-events-none absolute right-[80px] top-[120px] hidden w-[150px] lg:block" />
      <img src={lpSectionAsset("pricing/image_04_nobg.png")} alt="" role="presentation" className="pointer-events-none absolute left-[54px] top-[260px] hidden w-[48px] lg:block" />

      <LpSparkleDecorations sparkles={pricingSparkles} />

      <div className="relative z-10 mx-auto max-w-[1450px] px-6 sm:px-10 lg:px-12 xl:px-14">
        <div className="text-center">
          <h2 className="text-[32px] font-black leading-tight sm:text-[44px] lg:text-[52px]" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
            シンプルで始めやすい料金プラン
          </h2>
          <p className="mt-3 text-[16px] font-medium" style={{ color: "var(--lp-navy)" }}>
            まずは無料で試して、必要になったらアップグレード。
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          {trustPills.map((label) => (
            <span
              key={label}
              className="inline-flex min-w-[190px] items-center justify-center gap-3 rounded-full border bg-white px-5 py-2.5 text-[15px] font-bold"
              style={{ borderColor: "#cfe3ff", color: "var(--lp-cta)" }}
            >
              <CheckCircle2 className="h-6 w-6 fill-[var(--lp-cta)] text-white" aria-hidden />
              {label}
            </span>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3 lg:items-end">
          {plans.map((plan) => {
            const popular = plan.isPopular === true;
            const price = parsePrice(plan.price);
            return (
              <article
                key={plan.id}
                className="relative flex min-h-[470px] flex-col rounded-2xl border bg-white px-7 pb-7 pt-8"
                style={{
                  borderColor: popular ? "var(--lp-cta)" : "#e3ecf8",
                  borderWidth: popular ? 2 : 1,
                  boxShadow: popular
                    ? "0 16px 36px rgba(38,128,255,0.22)"
                    : "0 10px 26px rgba(20,50,110,0.13)",
                  transform: popular ? "translateY(-8px)" : "none",
                }}
              >
                {popular ? (
                  <span className="absolute left-1/2 top-[-18px] inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-7 py-2 text-[16px] font-black text-white" style={{ background: "var(--lp-cta)" }}>
                    <Star className="h-5 w-5 fill-white" aria-hidden />
                    おすすめ
                  </span>
                ) : null}

                <h3 className="text-[32px] font-black leading-none" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
                  {plan.name}
                </h3>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-[26px] font-black" style={{ color: "var(--lp-cta)" }}>
                    {price.currency}
                  </span>
                  <span className="text-[56px] font-black leading-none lg:text-[60px]" style={{ color: "var(--lp-cta)", letterSpacing: "0" }}>
                    {price.amount}
                  </span>
                  <span className="text-[22px] font-black" style={{ color: "var(--lp-navy)" }}>
                    /{plan.period || "月"}
                  </span>
                </div>
                <p className="mt-4 text-[16px] font-medium" style={{ color: "var(--lp-navy)" }}>
                  {plan.description}
                </p>
                <div className="my-5 h-px" style={{ background: "#e3ecf8" }} />
                <ul className="flex flex-1 flex-col gap-2.5">
                  {plan.features.slice(0, 6).map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[15px] font-bold leading-[1.5]" style={{ color: "var(--lp-navy)" }}>
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 fill-[var(--lp-cta)] text-white" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.id === "free" ? "/login" : "/pricing"}
                  className="mt-7 inline-flex min-h-[60px] items-center justify-center gap-4 rounded-full border-2 px-6 text-[18px] font-black transition-transform hover:-translate-y-0.5"
                  style={{
                    borderColor: "var(--lp-cta)",
                    background: popular ? "var(--lp-cta)" : "#fff",
                    color: popular ? "#fff" : "var(--lp-cta)",
                  }}
                >
                  {plan.ctaLabel}
                  <ArrowRight className="h-6 w-6" aria-hidden />
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mt-7 flex items-center justify-center gap-3 text-center text-[18px] font-bold" style={{ color: "var(--lp-navy)" }}>
          <ShieldCheck className="h-6 w-6 fill-[var(--lp-cta)] text-white" aria-hidden />
          就活Passは、まず無料で使い始められます。
        </p>
      </div>
    </section>
  );
}
