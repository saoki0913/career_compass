import { ArrowRight } from "lucide-react";
import { LANDING_STEPS } from "@/lib/marketing/landing-steps";
import { lpAsset } from "@/lib/marketing/lp-assets";

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
      className="relative overflow-hidden bg-white py-16 sm:py-20 lg:min-h-[760px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={lpAsset("shupass-v2/howto/wave.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-60 lg:block"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="mb-10 text-center">
          <h2
            className="text-[34px] leading-[1.2] sm:text-[44px] lg:text-[46px]"
            style={{
              color: "var(--lp-navy)",
              fontWeight: 800,
              letterSpacing: "0",
            }}
          >
            使い方は、<span style={{ color: "var(--lp-cta)" }}>シンプル。</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-2xl text-[16px] leading-[1.75]"
            style={{ color: "var(--lp-muted-text)" }}
          >
            就活の流れに沿って、必要な準備を自然につなげられます。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-[repeat(4,1fr)]">
          {LANDING_STEPS.map((step, index) => (
            <div key={step.number} className="relative">
              {index < LANDING_STEPS.length - 1 ? (
                <div
                  className="absolute -right-5 top-10 z-20 hidden h-10 w-10 items-center justify-center rounded-full bg-white lg:flex"
                  style={{
                    color: "var(--lp-cta)",
                    boxShadow: "0 10px 24px rgba(37, 99, 235, 0.12)",
                  }}
                  aria-hidden="true"
                >
                  <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
                </div>
              ) : null}

              <article
                className="relative flex min-h-[470px] flex-col overflow-hidden rounded-[18px] border bg-white px-4 pb-5 pt-4"
                style={{
                  borderColor: "var(--lp-border-default)",
                  boxShadow: "0 15px 30px rgba(20, 50, 110, 0.075)",
                }}
              >
                <div className="flex min-h-[58px] items-center gap-3">
                  <img
                    src={lpAsset(step.numberImage)}
                    alt={`ステップ${step.number}`}
                    className="h-[48px] w-[48px] shrink-0 object-contain"
                  />
                  <img
                    src={lpAsset(step.icon)}
                    alt=""
                    role="presentation"
                    className="h-[34px] w-[34px] shrink-0 object-contain"
                  />
                  <h3
                    className="text-[18px] leading-tight"
                    style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                  >
                    {step.label}
                  </h3>
                </div>

                <p
                  className="mt-4 min-h-[54px] text-[14px] leading-[1.65]"
                  style={{ color: "var(--lp-muted-text)" }}
                >
                  {step.description}
                </p>

                <div className="relative mt-3 min-h-[238px] flex-1">
                  <img
                    src={lpAsset(step.cardImage)}
                    alt={`${step.label}の画面イメージ`}
                    width={360}
                    height={270}
                    loading="lazy"
                    decoding="async"
                    className="absolute right-0 top-0 z-[2] h-auto w-[92%] rounded-xl lg:w-[78%]"
                    style={{ filter: "drop-shadow(0 12px 20px rgba(0, 34, 104, 0.11))" }}
                  />
                  <img
                    src={lpAsset(step.characterImage)}
                    alt={step.characterAlt}
                    width={220}
                    height={280}
                    loading="lazy"
                    decoding="async"
                    className="absolute bottom-0 left-0 z-[3] h-auto w-[140px] object-contain lg:w-[122px]"
                  />
                </div>

                <div
                  className="mt-3 flex min-h-[76px] items-center gap-3 rounded-[14px] border bg-white px-3 py-3"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <img
                    src={lpAsset(step.icon)}
                    alt=""
                    role="presentation"
                    className="h-7 w-7 shrink-0 object-contain"
                  />
                  <p
                    className="text-[13px] font-bold leading-[1.55]"
                    style={{ color: "var(--lp-navy)" }}
                  >
                    {STEP_SUPPORT_COPY[step.number]}
                  </p>
                </div>
              </article>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-3 text-center">
          <img
            src={lpAsset("shupass-v2/howto/star.png")}
            alt=""
            role="presentation"
            className="hidden h-10 w-10 object-contain sm:block"
          />
          <p
            className="text-[22px] leading-relaxed sm:text-[28px]"
            style={{ fontWeight: 800, color: "var(--lp-navy)" }}
          >
            準備・対策・管理まで、
            <span style={{ color: "var(--lp-cta)" }}>就活Passひとつで完結。</span>
          </p>
        </div>
      </div>
    </section>
  );
}
