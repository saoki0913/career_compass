import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";

const ASSET = LP_ASSET_BASE;

type FeatureVisual = {
  readonly src: string;
  readonly className: string;
};

type Feature = {
  readonly num: string;
  readonly icon: string;
  readonly title: string;
  readonly desc: string;
  readonly visuals: readonly FeatureVisual[];
};

const features: readonly Feature[] = [
  {
    num: "01",
    icon: "icons-circled/ai-sparkles.png",
    title: "ES添削AI",
    desc: "AIがESの構成・表現を見直し、改善ポイントを提案。",
    visuals: [
      {
        src: "ui-cards/es-review-window.png",
        className: "left-[37%] top-5 w-[220px] 2xl:w-[235px]",
      },
      {
        src: "ui-cards/score-85.png",
        className: "bottom-4 left-7 w-[220px] 2xl:w-[235px]",
      },
    ],
  },
  {
    num: "02",
    icon: "icons-circled/document.png",
    title: "志望動機・ガクチカ作成",
    desc: "経験を整理しながら、文章のたたき台づくりを支援。",
    visuals: [
      {
        src: "ui-cards/gakuchika-draft.png",
        className: "bottom-5 left-8 w-[280px] 2xl:w-[310px]",
      },
      {
        src: "ui-cards/analytics-card.png",
        className: "right-5 top-16 w-[180px] 2xl:w-[205px]",
      },
    ],
  },
  {
    num: "03",
    icon: "icons-circled/chat.png",
    title: "AI模擬面接",
    desc: "LLMとのチャットで模擬面接を実施。回答に対してフィードバックを提供。",
    visuals: [
      {
        src: "ui-cards/interview-flow.png",
        className: "bottom-6 left-7 w-[255px] 2xl:w-[280px]",
      },
      {
        src: "ui-cards/ai-interview-chat.png",
        className: "right-4 top-6 w-[175px] 2xl:w-[198px]",
      },
    ],
  },
  {
    num: "04",
    icon: "icons-circled/calendar-check.png",
    title: "締切・選考管理",
    desc: "応募締切や面接予定を見える化して、抜け漏れを防止。",
    visuals: [
      {
        src: "ui-cards/schedule-card.png",
        className: "bottom-7 left-8 w-[300px] 2xl:w-[325px]",
      },
      {
        src: "ui-cards/calendar-widget.png",
        className: "right-8 top-16 w-[185px] 2xl:w-[205px]",
      },
    ],
  },
  {
    num: "05",
    icon: "icons-circled/building.png",
    title: "企業管理・応募管理",
    desc: "企業ごとの情報・進捗・メモを一元管理。",
    visuals: [
      {
        src: "ui-cards/selection-status.png",
        className: "bottom-8 left-8 w-[335px] 2xl:w-[365px]",
      },
      {
        src: "ui-cards/card-companies.png",
        className: "right-8 top-20 w-[190px] 2xl:w-[205px]",
      },
    ],
  },
  {
    num: "06",
    icon: "icons-circled/calendar.png",
    title: "Googleカレンダー連携",
    desc: "予定を自動で連携して、就活スケジュールを整理。",
    visuals: [
      {
        src: "ui-cards/google-calendar.png",
        className: "bottom-10 left-8 w-[330px] 2xl:w-[360px]",
      },
      {
        src: "ui-cards/calendar-dayview.png",
        className: "right-7 top-14 w-[160px] 2xl:w-[180px]",
      },
    ],
  },
] as const;

const flowSteps = [
  {
    icon: "icons-circled/document.png",
    title: "作成",
    desc: "AIで効率的に作成",
  },
  {
    icon: "icons-circled/chat.png",
    title: "対策",
    desc: "AIで万全の準備",
  },
  {
    icon: "icons-circled/calendar-check.png",
    title: "管理",
    desc: "スケジュールを一元管理",
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative min-h-[940px] overflow-hidden bg-white py-[72px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={`${ASSET}/decorative/curved-lines-dot.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-0 top-[70px] hidden w-[440px] opacity-22 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/dot-pattern-light.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[6%] top-[245px] hidden w-[130px] opacity-50 2xl:block"
      />

      <div className="relative mx-auto max-w-[1600px] px-5 sm:px-8 2xl:px-0">
        <div className="grid items-center gap-9 xl:grid-cols-[560px_1fr]">
          <div className="text-center xl:text-left">
            <h2
              style={{
                color: "var(--lp-navy)",
                fontSize: "clamp(40px, 5vw, 64px)",
                fontWeight: 800,
                letterSpacing: "0",
                lineHeight: 1.15,
              }}
            >
              就活を加速させる、
              <br />
              <span style={{ color: "var(--lp-cta)" }}>6つ</span>
              の主要機能
            </h2>
            <p
              className="mx-auto mt-7 max-w-[560px] text-[19px] xl:mx-0"
              style={{ color: "var(--lp-muted-text)", lineHeight: 1.8 }}
            >
              書類作成から面接対策、管理まで。必要な準備をひとつにつなぐ。
            </p>
          </div>

          <div
            className="relative h-[220px] overflow-hidden rounded-[28px] border px-12 py-7"
            style={{
              borderColor: "var(--lp-border-default)",
              background: "linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
              boxShadow: "0 18px 36px rgba(0, 34, 104, 0.06)",
            }}
          >
            <img
              src={`${ASSET}/decorative/dot-grid-5x5.png`}
              alt=""
              role="presentation"
              className="pointer-events-none absolute left-7 top-6 h-14 w-14 opacity-45"
            />
            <img
              src={`${ASSET}/decorative/dot-grid-5x5.png`}
              alt=""
              role="presentation"
              className="pointer-events-none absolute bottom-6 right-7 h-14 w-14 opacity-45"
            />
            <div className="relative z-10 grid h-full grid-cols-[1fr_96px_1fr_96px_1fr] items-center">
              {flowSteps.map((step, index) => (
                <div key={step.title} className="contents">
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-white"
                      style={{ boxShadow: "0 16px 34px rgba(0, 102, 255, 0.12)" }}
                    >
                      <img
                        src={`${ASSET}/${step.icon}`}
                        alt=""
                        role="presentation"
                        className="h-[72px] w-[72px] object-contain"
                      />
                    </div>
                    <h3
                      className="mt-4 text-[24px] leading-none"
                      style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-2 text-[15px]" style={{ color: "var(--lp-navy)" }}>
                      {step.desc}
                    </p>
                  </div>
                  {index < flowSteps.length - 1 ? (
                    <div
                      className="h-0 border-t-[8px] border-dotted"
                      style={{ borderColor: "rgba(37, 99, 235, 0.48)" }}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-7 md:grid-cols-2 xl:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.num}
              className="relative min-h-[295px] overflow-hidden rounded-[18px] border bg-white p-8"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow:
                  "0 18px 36px rgba(0, 34, 104, 0.07), 0 2px 9px rgba(0, 34, 104, 0.04)",
              }}
            >
              <div className="flex items-start gap-5">
                <img
                  src={`${ASSET}/${feature.icon}`}
                  alt=""
                  role="presentation"
                  width={70}
                  height={70}
                  className="h-[70px] w-[70px] shrink-0 object-contain"
                />
                <div>
                  <div className="flex items-baseline gap-4">
                    <span
                      className="text-[42px] leading-none"
                      style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                    >
                      {feature.num}
                    </span>
                    <h3
                      className="text-[24px] leading-tight"
                      style={{ color: "var(--lp-navy)", fontWeight: 800 }}
                    >
                      {feature.title}
                    </h3>
                  </div>
                  <p
                    className="mt-5 max-w-[300px] text-[18px] leading-[1.65]"
                    style={{ color: "var(--lp-muted-text)" }}
                  >
                    {feature.desc}
                  </p>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[112px]">
                {feature.visuals.map((visual) => (
                  <img
                    key={visual.src}
                    src={`${ASSET}/${visual.src}`}
                    alt=""
                    role="presentation"
                    loading="eager"
                    decoding="sync"
                    className={`absolute h-auto ${visual.className}`}
                    style={{
                      filter: "drop-shadow(0 14px 24px rgba(0, 34, 104, 0.08))",
                    }}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
