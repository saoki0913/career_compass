import { LANDING_STEPS } from "@/lib/marketing/landing-steps";

const ASSET_BASE = "/marketing/LP/assets/";

const CONNECTORS = [
  { src: "generated_assets_transparent/06_connector_arrow_1_to_2.png" },
  { src: "generated_assets_transparent/11_connector_arrow_2_to_3.png" },
  { src: "generated_assets_transparent/17_connector_arrow_3_to_4.png" },
] as const;

export function HowToUseSection() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden py-20 lg:py-28"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="mx-auto max-w-[1400px] px-6 lg:px-12">
        {/* ---------- Heading ---------- */}
        <div className="mb-14 text-center">
          <h2
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontWeight: 800,
              color: "var(--lp-navy)",
              lineHeight: 1.2,
            }}
          >
            使い方は、シンプル。
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-base"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.7 }}
          >
            就活の流れに沿って、必要な準備を自然につなげられます。
          </p>
        </div>

        {/* ---------- 4 Step Cards ---------- */}
        <div className="relative grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Connector arrows between cards (lg only) */}
          {CONNECTORS.map((connector, i) => (
            <div
              key={`connector-${i}`}
              className="pointer-events-none absolute top-[72px] hidden lg:block"
              style={{
                left: `calc(${(i + 1) * 25}% - 24px)`,
                width: 48,
                transform: "translateX(-50%)",
              }}
              aria-hidden="true"
            >
              <img
                src={`${ASSET_BASE}${connector.src}`}
                alt=""
                role="presentation"
                className="h-auto w-full opacity-30"
              />
            </div>
          ))}

          {LANDING_STEPS.map((step) => (
            <article
              key={step.number}
              className="relative rounded-2xl border p-6 text-center"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "var(--lp-border-default)",
                boxShadow:
                  "0 0 0 1px rgba(0,0,0,0.03), 0 2px 4px rgba(50,50,93,0.08), 0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              {/* Number image */}
              <img
                src={`${ASSET_BASE}${step.numberImage}`}
                alt={`ステップ${step.number}`}
                className="mx-auto h-12 w-12"
              />

              {/* Icon */}
              <img
                src={`${ASSET_BASE}${step.icon}`}
                alt=""
                className="mx-auto mt-3 h-10 w-10"
              />

              {/* Title */}
              <h3
                className="mt-3 text-lg"
                style={{ fontWeight: 700, color: "var(--lp-navy)" }}
              >
                {step.label}
              </h3>

              {/* Description */}
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--lp-muted-text)", lineHeight: 1.65 }}
              >
                {step.description}
              </p>

              {/* Step card screenshot */}
              <img
                src={`${ASSET_BASE}${step.cardImage}`}
                alt={`${step.label}の画面イメージ`}
                width={320}
                height={220}
                className="mt-4 h-auto w-full rounded-xl shadow-sm"
              />

              {/* Character illustration */}
              <img
                src={`${ASSET_BASE}${step.characterImage}`}
                alt={step.characterAlt}
                width={120}
                height={150}
                className="mx-auto mt-4 h-auto w-[110px]"
              />
            </article>
          ))}
        </div>

        {/* ---------- Bottom tagline ---------- */}
        <p
          className="mt-14 text-center text-lg"
          style={{ fontWeight: 700, color: "var(--lp-navy)" }}
        >
          準備・対策・管理まで、就活Passひとつで完結。
        </p>
      </div>
    </section>
  );
}
