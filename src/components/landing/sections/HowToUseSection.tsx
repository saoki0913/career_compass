import { LANDING_STEPS } from "@/lib/marketing/landing-steps";
import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";

const ASSET_BASE = `${LP_ASSET_BASE}/`;

const CONNECTORS = [
  { src: "decorative/connector-arrow-1-to-2.png" },
  { src: "decorative/connector-arrow-2-to-3.png" },
  { src: "decorative/connector-arrow-3-to-4.png" },
] as const;

const STEP_SUPPORT_COPY = {
  "1": "気になる企業をすぐに登録。情報を一元管理できます。",
  "2": "AIが内容を添削し、伝わるESに仕上げることができます。",
  "3": "AIが回答を分析し、改善点や強みをフィードバックします。",
  "4": "締切や面接予定をまとめて管理。うっかり忘れを防げます。",
} as const;

export function HowToUseSection() {
  return (
    <section
      id="how-it-works"
      className="relative min-h-[940px] overflow-hidden bg-white py-[72px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={`${ASSET_BASE}decorative/wave-line-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-8 left-0 hidden w-full opacity-36 2xl:block"
      />

      <div className="mx-auto max-w-[1600px] px-5 sm:px-8 2xl:px-0">
        <div className="mb-[54px] text-center">
          <h2
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(40px, 5vw, 66px)",
              fontWeight: 800,
              letterSpacing: "0",
              lineHeight: 1.16,
            }}
          >
            使い方は、<span style={{ color: "var(--lp-cta)" }}>シンプル。</span>
          </h2>
          <p
            className="mx-auto mt-5 max-w-3xl text-[22px]"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.75 }}
          >
            就活の流れに沿って、必要な準備を自然につなげられます。
          </p>
        </div>

        <div className="relative grid grid-cols-1 gap-7 md:grid-cols-2 2xl:grid-cols-[repeat(4,360px)] 2xl:justify-between">
          {CONNECTORS.map((connector, index) => (
            <img
              key={connector.src}
              src={`${ASSET_BASE}${connector.src}`}
              alt=""
              role="presentation"
              className="pointer-events-none absolute top-[34px] hidden h-auto w-[104px] opacity-85 2xl:block"
              style={{ left: `${360 + index * 400 + 18}px` }}
            />
          ))}

          {LANDING_STEPS.map((step) => (
            <article
              key={step.number}
              className="relative flex min-h-[590px] flex-col overflow-hidden rounded-[18px] border bg-white px-5 pb-6 pt-5"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow:
                  "0 18px 36px rgba(0, 34, 104, 0.07), 0 2px 9px rgba(0, 34, 104, 0.04)",
              }}
            >
              <div className="flex min-h-[76px] items-center gap-4">
                <img
                  src={`${ASSET_BASE}${step.numberImage}`}
                  alt={`ステップ${step.number}`}
                  className="h-[62px] w-[62px] shrink-0 object-contain"
                />
                <img
                  src={`${ASSET_BASE}${step.icon}`}
                  alt=""
                  role="presentation"
                  className="h-[44px] w-[44px] shrink-0 object-contain"
                />
                <h3
                  className="text-[23px] leading-tight"
                  style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                >
                  {step.label}
                </h3>
              </div>

              <p
                className="mt-5 min-h-[78px] text-[18px] leading-[1.75]"
                style={{ color: "var(--lp-muted-text)" }}
              >
                {step.description}
              </p>

              <div className="relative mt-4 min-h-[306px] flex-1">
                <img
                  src={`${ASSET_BASE}${step.cardImage}`}
                  alt={`${step.label}の画面イメージ`}
                  width={360}
                  height={270}
                  loading="eager"
                  decoding="sync"
                  className="absolute right-0 top-0 z-[2] h-auto w-[76%] rounded-xl"
                  style={{ filter: "drop-shadow(0 12px 20px rgba(0, 34, 104, 0.11))" }}
                />
                <img
                  src={`${ASSET_BASE}${step.characterImage}`}
                  alt={step.characterAlt}
                  width={220}
                  height={280}
                  loading="eager"
                  decoding="sync"
                  className="absolute bottom-0 left-0 z-[3] h-auto w-[150px] object-contain 2xl:w-[168px]"
                />
              </div>

              <div
                className="mt-4 flex min-h-[92px] items-center gap-4 rounded-[14px] border bg-white px-4 py-4"
                style={{ borderColor: "var(--lp-border-default)" }}
              >
                <img
                  src={`${ASSET_BASE}${step.icon}`}
                  alt=""
                  role="presentation"
                  className="h-8 w-8 shrink-0 object-contain"
                />
                <p
                  className="text-[18px] font-bold leading-[1.55]"
                  style={{ color: "var(--lp-navy)" }}
                >
                  {STEP_SUPPORT_COPY[step.number]}
                </p>
              </div>
            </article>
          ))}
        </div>

        <p
          className="mt-[58px] text-center text-[30px] leading-relaxed lg:text-[42px]"
          style={{ fontWeight: 800, color: "var(--lp-navy)" }}
        >
          <span style={{ color: "var(--lp-cta)" }}>準備・対策・管理</span>
          まで、就活Passひとつで完結。
        </p>
      </div>
    </section>
  );
}
