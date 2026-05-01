import Link from "next/link";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { getMarketingPricingPlans } from "@/lib/marketing/pricing-plans";

/* ------------------------------------------------------------------ */
/*  Inline SVG icon components                                        */
/* ------------------------------------------------------------------ */

function PricingCheckIcon({ filled }: { filled: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="#2d6eff" />
        <path
          d="M7.5 12.5l3 3 6-6.5"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="11" stroke="#2d6eff" strokeWidth="1.6" />
      <path
        d="M7.5 12.5l3 3 6-6.5"
        stroke="#2d6eff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PricingArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PricingShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 22, height: 22 }} aria-hidden="true">
      <path
        d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6l8-3z"
        fill="#2d6eff"
      />
      <path
        d="M8.5 12l2.5 2.5 4.5-5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PricingStarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="#fff" className="h-4 w-4" aria-hidden="true">
      <path d="M12 2l3 6.5 7 1-5 5 1.5 7L12 18l-6.5 3.5L7 14.5l-5-5 7-1z" />
    </svg>
  );
}

function PricingTrustCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#2d6eff" />
      <path
        d="M7.5 12.5l3 3 6-6.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Wave SVG                                                          */
/* ------------------------------------------------------------------ */

function PricingWave() {
  return (
    <svg
      viewBox="0 0 1440 130"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="absolute bottom-0 left-0 w-full"
      style={{ height: 130 }}
    >
      <path
        d="M0 90 C 180 30, 320 80, 480 70 S 760 40, 920 80 1240 100, 1440 60 L1440 130 L0 130 Z"
        fill="#e2ecff"
        opacity="0.55"
      />
      <path
        d="M0 100 C 200 70, 380 110, 560 95 S 820 70, 1000 100 1280 120, 1440 90 L1440 130 L0 130 Z"
        fill="#cfdcf7"
        opacity="0.35"
      />
      <path
        d="M0 70 C 200 30, 380 90, 600 70 S 1000 40, 1240 80 1380 70, 1440 65"
        fill="none"
        stroke="#7aa3ef"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M0 88 C 220 60, 420 100, 640 86 S 1040 70, 1280 96 1400 88, 1440 84"
        fill="none"
        stroke="#9bb8eb"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="120" cy="58" r="5" fill="#4a90ff" />
      <circle cx="220" cy="78" r="8" fill="#4a90ff" />
      <circle cx="560" cy="92" r="5" fill="#4a90ff" />
      <circle cx="820" cy="74" r="3.5" fill="#7aa3ef" />
      <circle cx="1180" cy="80" r="6" fill="#4a90ff" />
      <circle cx="1320" cy="68" r="4" fill="#7aa3ef" />
      <circle cx="1410" cy="66" r="5" fill="#4a90ff" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const TRUST_PILLS = ["無料プランあり", "30秒で簡単スタート", "あとから変更OK"] as const;

const FONT_FAMILY =
  "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Extract currency and numeric amount from price string like "¥1,490" */
function parsePrice(price: string): { currency: string; amount: string } {
  const match = price.match(/^(¥)(.+)$/);
  if (!match) return { currency: "", amount: price };
  return { currency: match[1], amount: match[2] };
}

/* ------------------------------------------------------------------ */
/*  PricingSection                                                    */
/* ------------------------------------------------------------------ */

export function PricingSection() {
  const plans = getMarketingPricingPlans("monthly");

  return (
    <section
      id="pricing"
      className="relative overflow-hidden"
      style={{
        padding: "110px 0 130px",
        background: "linear-gradient(180deg, #f7faff 0%, #eaf2ff 100%)",
        fontFamily: FONT_FAMILY,
      }}
    >
      {/* ---------- Background decoration images ---------- */}
      <img
        src={lpSectionAsset("pricing/icon-credit-card-price.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 30, left: 60, width: 130, opacity: 0.95 }}
      />
      <img
        src={lpSectionAsset("hero/icon-document-check.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 50, right: 100, width: 100, opacity: 0.85 }}
      />
      <img
        src={lpSectionAsset("hero/icon-growth-chart.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 90, right: 30, width: 90, opacity: 0.85 }}
      />
      <img
        src={lpSectionAsset("pricing/icon-star.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 230, left: 30, width: 60, opacity: 0.85 }}
      />
      <img
        src={lpSectionAsset("pricing/icon-star.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 140, left: 180, width: 36, opacity: 0.7 }}
      />
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 50, left: 0, width: 110, opacity: 0.55 }}
      />
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ top: 30, right: 0, width: 130, opacity: 0.55 }}
      />

      {/* ---------- "+" text decorations ---------- */}
      <span
        className="pointer-events-none absolute hidden select-none lg:block"
        aria-hidden="true"
        style={{
          top: 24,
          left: "50%",
          transform: "translateX(-280px)",
          fontSize: 26,
          fontWeight: 700,
          color: "#9bb8eb",
        }}
      >
        +
      </span>
      <span
        className="pointer-events-none absolute hidden select-none lg:block"
        aria-hidden="true"
        style={{
          top: 60,
          right: "18%",
          fontSize: 26,
          fontWeight: 700,
          color: "#9bb8eb",
        }}
      >
        +
      </span>
      <span
        className="pointer-events-none absolute hidden select-none lg:block"
        aria-hidden="true"
        style={{
          top: 200,
          right: "6%",
          fontSize: 22,
          fontWeight: 700,
          color: "#9bb8eb",
        }}
      >
        +
      </span>

      {/* ---------- Wave SVG ---------- */}
      <PricingWave />

      {/* ---------- Content ---------- */}
      <div
        className="pr-section-inner relative z-10 mx-auto"
        style={{ maxWidth: 1140, padding: "0 40px" }}
      >
        {/* Responsive padding override for small screens */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media (max-width: 600px) {
                .pr-section-inner { padding: 0 20px !important; }
                .pr-section-title { font-size: 32px !important; }
              }
              @media (min-width: 980px) {
                .pr-card-grid { grid-template-columns: repeat(3, 1fr) !important; }
              }
              .pr-card-v2:hover { transform: translateY(-4px) !important; box-shadow: 0 14px 32px rgba(15,35,75,0.08) !important; }
              .pr-card-v2--featured:hover { transform: translateY(-16px) !important; box-shadow: 0 18px 40px rgba(45,110,255,0.22) !important; }
              .pr-cta-v2:hover { background: #f0f6ff !important; }
              .pr-cta-v2--primary:hover { background: #1f5be0 !important; }
            `,
          }}
        />

        {/* Header */}
        <div className="text-center">
          <h2
            className="pr-section-title"
            style={{
              fontSize: 46,
              fontWeight: 800,
              letterSpacing: "0.02em",
              color: "#0d1f3a",
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            シンプルで<span style={{ color: "#2d6eff" }}>始めやすい</span>
            料金プラン
          </h2>
          <p
            style={{
              fontSize: 18,
              color: "#4a5568",
              fontWeight: 500,
              margin: "0 0 26px",
            }}
          >
            まずは無料で試して、必要になったらアップグレード。
          </p>
        </div>

        {/* Trust pills */}
        <div
          className="flex flex-wrap items-center justify-center"
          style={{ gap: 14, marginBottom: 40 }}
        >
          {TRUST_PILLS.map((label) => (
            <span
              key={label}
              className="inline-flex items-center"
              style={{
                padding: "10px 22px",
                background: "#fff",
                borderRadius: 999,
                border: "1px solid #d6e5ff",
                fontSize: 15,
                fontWeight: 600,
                color: "#1f3052",
                boxShadow: "0 4px 14px rgba(45,110,255,0.06)",
                gap: 8,
              }}
            >
              <PricingTrustCheckIcon />
              {label}
            </span>
          ))}
        </div>

        {/* Card grid */}
        <div
          className="pr-card-grid grid grid-cols-1"
          style={{ gap: 24, marginBottom: 48 }}
        >
          {plans.map((plan) => {
            const isPopular = plan.isPopular === true;
            const { currency, amount } = parsePrice(plan.price);

            return (
              <article
                key={plan.id}
                className={`pr-card-v2 group relative flex flex-col bg-white${isPopular ? " pr-card-v2--featured" : ""}`}
                style={{
                  borderRadius: 22,
                  padding: isPopular ? "50px 30px 30px" : "38px 30px 30px",
                  border: isPopular
                    ? "2px solid #2d6eff"
                    : "1px solid #e3ecf8",
                  boxShadow: isPopular
                    ? "0 14px 36px rgba(45,110,255,0.18)"
                    : "0 8px 24px rgba(15,35,75,0.05)",
                  transform: isPopular ? "translateY(-12px)" : "none",
                  transition: "transform 0.25s ease, box-shadow 0.25s ease",
                }}
              >
                {/* Badge for featured card */}
                {isPopular && (
                  <span
                    className="absolute flex items-center"
                    style={{
                      top: -16,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#2d6eff",
                      color: "#fff",
                      padding: "7px 22px",
                      borderRadius: 999,
                      fontSize: 14,
                      fontWeight: 700,
                      gap: 6,
                      boxShadow: "0 6px 14px rgba(45,110,255,0.30)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <PricingStarIcon />
                    おすすめ
                  </span>
                )}

                {/* Plan name */}
                <h3
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#0d1f3a",
                    margin: "0 0 12px",
                  }}
                >
                  {plan.name}
                </h3>

                {/* Price: currency + amount + unit */}
                <div className="flex items-baseline">
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: "#0d1f3a",
                    }}
                  >
                    {currency}
                  </span>
                  <span
                    style={{
                      fontSize: 56,
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      lineHeight: 1,
                      color: "#0d1f3a",
                    }}
                  >
                    {amount}
                  </span>
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 600,
                      color: "#4a5568",
                      marginLeft: 4,
                    }}
                  >
                    /{plan.period || "月"}
                  </span>
                </div>

                {/* Tagline / description */}
                <p
                  style={{
                    fontSize: 14,
                    color: "#5b6677",
                    fontWeight: 500,
                    margin: "8px 0 0",
                  }}
                >
                  {plan.description}
                </p>

                {/* Divider */}
                <div
                  style={{
                    height: 1,
                    background: "#e8eef7",
                    margin: "22px 0 20px",
                  }}
                />

                {/* Features list */}
                <ul
                  className="flex flex-1 flex-col"
                  style={{ gap: 12, margin: "0 0 28px", listStyle: "none", padding: 0 }}
                >
                  {plan.features.slice(0, 6).map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start"
                      style={{
                        gap: 10,
                        fontSize: 15,
                        fontWeight: 600,
                        color: "#2a3548",
                      }}
                    >
                      <span className="mt-0.5">
                        <PricingCheckIcon filled={isPopular} />
                      </span>
                      <span style={{ lineHeight: 1.45 }}>
                        {feature.replace(/（.*?）/g, "")}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                <Link
                  href={plan.id === "free" ? "/login" : "/pricing"}
                  className={`pr-cta-v2 inline-flex w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2${isPopular ? " pr-cta-v2--primary" : ""}`}
                  style={{
                    padding: "14px 22px",
                    borderRadius: 999,
                    background: isPopular ? "#2d6eff" : "#fff",
                    color: isPopular ? "#fff" : "#2d6eff",
                    border: "1.5px solid #2d6eff",
                    fontSize: 16,
                    fontWeight: 700,
                    gap: 10,
                    boxShadow: isPopular
                      ? "0 8px 18px rgba(45,110,255,0.30)"
                      : "none",
                    textDecoration: "none",
                    transition: "background 0.2s ease",
                  }}
                >
                  {plan.ctaLabel}
                  <PricingArrowIcon />
                </Link>
              </article>
            );
          })}
        </div>

        {/* Footnote */}
        <div
          className="flex items-center justify-center"
          style={{
            gap: 10,
            fontSize: 15,
            color: "#2a3548",
            fontWeight: 600,
          }}
        >
          <PricingShieldIcon />
          <span>就活Passは、まず無料で使い始められます。</span>
        </div>
      </div>
    </section>
  );
}
