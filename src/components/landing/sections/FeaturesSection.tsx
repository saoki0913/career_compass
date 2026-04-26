const ASSET = "/marketing/LP/assets";

const features = [
  {
    num: "01",
    icon: "icons-circled/document.png",
    title: "ES添削AI",
    desc: "AIがあなたのESを多角的に分析。総合スコアと改善ポイントを提示し、より伝わる文章に仕上げます。",
    mockups: ["ui-cards/es-review-window.png", "ui-cards/score-85.png"],
  },
  {
    num: "02",
    icon: "icons-circled/ai-sparkles.png",
    title: "志望動機・ガクチカ作成",
    desc: "対話形式で経験を深掘り。あなたらしい志望動機やガクチカのたたき台をAIが作成します。",
    mockups: ["ui-cards/gakuchika-draft.png"],
  },
  {
    num: "03",
    icon: "icons-circled/chat.png",
    title: "AI模擬面接",
    desc: "企業情報を踏まえてAI面接官が質問。回答への深掘りや改善フィードバックまで対応します。",
    mockups: ["ui-cards/ai-interview-chat.png", "ui-cards/interview-flow.png"],
  },
  {
    num: "04",
    icon: "icons-circled/building.png",
    title: "企業・選考管理",
    desc: "志望企業を一元管理。選考状況やメモを整理し、応募の全体像を把握できます。",
    mockups: ["ui-cards/selection-status.png"],
  },
  {
    num: "05",
    icon: "icons-circled/calendar-check.png",
    title: "スケジュール管理",
    desc: "締切や面接日程の候補を確認しながら整理。予定の見落としを減らします。",
    mockups: ["ui-cards/schedule-card.png", "ui-cards/calendar-widget.png"],
  },
  {
    num: "06",
    icon: "icons-circled/calendar.png",
    title: "Googleカレンダー連携",
    desc: "就活の予定をGoogleカレンダーに自動同期。普段のスケジュールと一括管理。",
    mockups: ["ui-cards/google-calendar.png"],
  },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative overflow-hidden py-20 lg:py-28"
      style={{ background: "var(--lp-surface-page)" }}
    >
      {/* Decorative elements -- hidden on mobile */}
      <img
        src={`${ASSET}/decorative/curved-lines-dot.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute top-12 left-0 hidden w-[180px] lg:block"
        style={{ opacity: 0.12 }}
      />
      <img
        src={`${ASSET}/decorative/star-sparkle-2.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-8 bottom-16 hidden w-[100px] lg:block"
        style={{ opacity: 0.1 }}
      />

      <div className="relative mx-auto max-w-[1400px] px-6 lg:px-12">
        {/* ---- Header ---- */}
        <div className="text-center lg:text-left">
          <h2
            style={{
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontWeight: 800,
              color: "var(--lp-navy)",
              lineHeight: 1.2,
            }}
          >
            就活を加速させる、
            <br />
            <span style={{ color: "var(--lp-cta)" }}>6つ</span>の主要機能。
          </h2>
          <p
            className="mx-auto mt-4 max-w-lg text-base lg:mx-0"
            style={{ color: "var(--lp-muted-text)", lineHeight: 1.7 }}
          >
            書類作成から面接対策、管理まで。必要な準備をひとつにつなぐ。
          </p>
        </div>

        {/* ---- Flow diagram ---- */}
        <div className="mt-8 mb-14 text-center lg:text-left">
          <img
            src={`${ASSET}/flow/create-prepare-manage.png`}
            alt="作成 → 対策 → 管理フロー"
            width={500}
            height={80}
            className="mx-auto h-auto max-w-lg lg:mx-0"
          />
        </div>

        {/* ---- 6 Feature cards ---- */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.num}
              className="overflow-hidden rounded-2xl border p-6"
              style={{
                background: "#ffffff",
                borderColor: "var(--lp-border-default)",
                boxShadow: "var(--lp-shadow-card)",
              }}
            >
              {/* Top row: number + icon */}
              <div className="flex items-center gap-3">
                <span
                  className="text-sm tracking-wider"
                  style={{ fontWeight: 800, color: "var(--lp-cta)" }}
                >
                  {f.num}
                </span>
                <img
                  src={`${ASSET}/${f.icon}`}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10"
                />
              </div>

              {/* Title */}
              <h3
                className="mt-3 text-lg"
                style={{ fontWeight: 700, color: "var(--lp-navy)" }}
              >
                {f.title}
              </h3>

              {/* Description */}
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--lp-muted-text)" }}
              >
                {f.desc}
              </p>

              {/* Mockup images */}
              <div
                className={`mt-4 ${
                  f.mockups.length > 1
                    ? "grid grid-cols-2 gap-3"
                    : ""
                }`}
              >
                {f.mockups.map((src) => (
                  <img
                    key={src}
                    src={`${ASSET}/${src}`}
                    alt={`${f.title} UI`}
                    width={420}
                    height={280}
                    className="h-auto w-full rounded-lg"
                    style={{
                      boxShadow:
                        "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
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
