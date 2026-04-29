import { lpAsset } from "@/lib/marketing/lp-assets";

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
      { src: "ui-cards/es-review-window.png", className: "right-4 top-4 w-[168px]" },
      { src: "ui-cards/score-85.png", className: "bottom-4 left-5 w-[172px]" },
    ],
  },
  {
    num: "02",
    icon: "icons-circled/document.png",
    title: "志望動機・ガクチカ作成",
    desc: "経験を整理しながら、文章のたたき台づくりを支援。",
    visuals: [
      { src: "ui-cards/gakuchika-draft.png", className: "bottom-5 left-5 w-[218px]" },
      { src: "ui-cards/analytics-card.png", className: "right-4 top-10 w-[140px]" },
    ],
  },
  {
    num: "03",
    icon: "icons-circled/chat.png",
    title: "AI模擬面接",
    desc: "チャット形式で練習し、回答の改善ポイントを確認。",
    visuals: [
      { src: "ui-cards/interview-flow.png", className: "bottom-5 left-5 w-[202px]" },
      { src: "ui-cards/ai-interview-chat.png", className: "right-4 top-5 w-[132px]" },
    ],
  },
  {
    num: "04",
    icon: "icons-circled/calendar-check.png",
    title: "締切・選考管理",
    desc: "応募締切や面接予定を見える化して、抜け漏れを防止。",
    visuals: [
      { src: "ui-cards/schedule-card.png", className: "bottom-5 left-5 w-[230px]" },
      { src: "ui-cards/calendar-widget.png", className: "right-5 top-10 w-[142px]" },
    ],
  },
  {
    num: "05",
    icon: "icons-circled/building.png",
    title: "企業管理・応募管理",
    desc: "企業ごとの情報・進捗・メモをまとめて整理。",
    visuals: [
      { src: "ui-cards/selection-status.png", className: "bottom-5 left-5 w-[248px]" },
      { src: "ui-cards/card-companies.png", className: "right-5 top-12 w-[144px]" },
    ],
  },
  {
    num: "06",
    icon: "icons-circled/calendar.png",
    title: "Googleカレンダー連携",
    desc: "予定を連携し、就活スケジュールを日常の予定と一緒に管理。",
    visuals: [
      { src: "ui-cards/google-calendar.png", className: "bottom-6 left-5 w-[246px]" },
      { src: "ui-cards/calendar-dayview.png", className: "right-5 top-10 w-[128px]" },
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
      className="relative overflow-hidden bg-white py-16 sm:py-20 lg:min-h-[830px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={lpAsset("decorative/dot-pattern-light.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[3%] top-[72px] hidden w-[130px] opacity-45 lg:block"
      />
      <img
        src={lpAsset("decorative/dot-grid-5x5.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[6%] top-[112px] hidden w-[92px] opacity-55 lg:block"
      />

      <div className="relative mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="grid items-center gap-8 lg:grid-cols-[420px_1fr]">
          <div className="text-center lg:text-left">
            <h2
              className="text-[34px] leading-[1.2] sm:text-[44px] lg:text-[46px]"
              style={{
                color: "var(--lp-navy)",
                fontWeight: 800,
                letterSpacing: "0",
              }}
            >
              就活を加速させる、
              <br />
              <span style={{ color: "var(--lp-cta)" }}>6つ</span>
              の主要機能
            </h2>
            <p
              className="mx-auto mt-5 max-w-[430px] text-[16px] leading-[1.8] lg:mx-0"
              style={{ color: "var(--lp-muted-text)" }}
            >
              書類作成から面接対策、管理まで。必要な準備をひとつにつなぐ。
            </p>
          </div>

          <div
            className="relative overflow-hidden rounded-[22px] border px-5 py-6 sm:px-8"
            style={{
              borderColor: "var(--lp-border-default)",
              background: "linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
              boxShadow: "0 16px 32px rgba(20, 50, 110, 0.07)",
            }}
          >
            <img
              src={lpAsset("decorative/dot-grid-5x5.png")}
              alt=""
              role="presentation"
              className="pointer-events-none absolute left-5 top-5 h-12 w-12 opacity-35"
            />
            <img
              src={lpAsset("decorative/dot-grid-5x5.png")}
              alt=""
              role="presentation"
              className="pointer-events-none absolute bottom-5 right-5 h-12 w-12 opacity-35"
            />
            <div className="relative z-10 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_54px_1fr_54px_1fr] sm:items-center">
              {flowSteps.map((step, index) => (
                <div key={step.title} className="contents">
                  <div className="flex flex-col items-center text-center">
                    <div
                      className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-white"
                      style={{ boxShadow: "0 14px 28px rgba(37, 99, 235, 0.11)" }}
                    >
                      <img
                        src={lpAsset(step.icon)}
                        alt=""
                        role="presentation"
                        className="h-[54px] w-[54px] object-contain"
                      />
                    </div>
                    <h3
                      className="mt-3 text-[22px] leading-none"
                      style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                    >
                      {step.title}
                    </h3>
                    <p className="mt-2 text-[13px]" style={{ color: "var(--lp-navy)" }}>
                      {step.desc}
                    </p>
                  </div>
                  {index < flowSteps.length - 1 ? (
                    <div
                      className="hidden h-0 border-t-[6px] border-dotted sm:block"
                      style={{ borderColor: "rgba(37, 99, 235, 0.46)" }}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.num}
              className="relative min-h-[254px] overflow-hidden rounded-[18px] border bg-white p-6"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow: "0 15px 30px rgba(20, 50, 110, 0.075)",
              }}
            >
              <div className="flex items-start gap-4">
                <img
                  src={lpAsset(feature.icon)}
                  alt=""
                  role="presentation"
                  className="h-[54px] w-[54px] shrink-0 object-contain"
                />
                <div>
                  <div className="flex items-baseline gap-3">
                    <span
                      className="text-[34px] leading-none"
                      style={{ color: "var(--lp-cta)", fontWeight: 800 }}
                    >
                      {feature.num}
                    </span>
                    <h3
                      className="text-[18px] leading-tight"
                      style={{ color: "var(--lp-navy)", fontWeight: 800 }}
                    >
                      {feature.title}
                    </h3>
                  </div>
                  <p
                    className="mt-3 max-w-[250px] text-[13px] leading-[1.6]"
                    style={{ color: "var(--lp-muted-text)" }}
                  >
                    {feature.desc}
                  </p>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[98px]">
                {feature.visuals.map((visual) => (
                  <img
                    key={visual.src}
                    src={lpAsset(visual.src)}
                    alt=""
                    role="presentation"
                    loading="lazy"
                    decoding="async"
                    className={`absolute h-auto ${visual.className}`}
                    style={{ filter: "drop-shadow(0 12px 20px rgba(0, 34, 104, 0.08))" }}
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
