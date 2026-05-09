import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";

const worries = [
  {
    src: "worries/processed/image7_nobg.png",
    title: "ESがうまく書けない",
    text: "何を書けばいいか分からず、手が止まってしまう。",
  },
  {
    src: "worries/processed/image5_nobg.png",
    title: "締切や選考の管理が大変",
    text: "企業ごとの予定がバラバラで、抜け漏れが不安。",
  },
  {
    src: "worries/processed/image6_nobg.png",
    title: "面接に自信が持てない",
    text: "何を聞かれるか分からず、本番でうまく話せるか不安。",
  },
  {
    src: "worries/processed/image4_nobg.png",
    title: "情報収集に時間がかかる",
    text: "企業情報や応募状況を整理できず、就活が非効率になりやすい。",
  },
] as const;

const painSparkles = [
  { x: 10, y: 10, size: 12, opacity: 0.3, color: "#b9d8ff" },
  { x: 90, y: 15, size: 14, opacity: 0.25, color: "#78b5ff" },
  { x: 5, y: 65, size: 10, opacity: 0.35, color: "#d3e5ff", type: "dot" as const },
  { x: 80, y: 70, size: 8, opacity: 0.3, color: "#b9d8ff", type: "dot" as const },
] as const;

export function PainPointsSection() {
  return (
    <section
      id="worries"
      data-section="worries"
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)",
        padding: "64px 0 58px",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden>
        <circle cx="76" cy="164" r="72" fill="#e8f2ff" />
        <path d="M1340 192 C1460 116 1550 188 1672 132" fill="none" stroke="#c9e0ff" strokeWidth="2" />
        <path d="M1052 900 C1240 842 1406 934 1672 800" fill="none" stroke="#c9e0ff" strokeWidth="2" />
        <path d="M18 116 H102 M18 132 H102 M18 148 H102 M18 164 H102" stroke="#cfe3ff" strokeDasharray="1 14" strokeLinecap="round" strokeWidth="5" />
      </svg>

      <LpSparkleDecorations sparkles={painSparkles} />

      <div className="relative z-10 mx-auto max-w-[1530px] px-6 sm:px-10 lg:px-12 xl:px-14">
        <div className="mb-9 text-center">
          <span className="mb-2 inline-block text-[44px] leading-none" style={{ color: "var(--lp-cta)" }} aria-hidden>
            〜
          </span>
          <h2 className="text-[32px] font-black leading-tight sm:text-[44px] lg:text-[52px]" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
            こんな<span style={{ color: "var(--lp-cta)" }}>悩み</span>、ありませんか？
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {worries.map((worry) => (
            <article
              key={worry.title}
              className="group overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-1"
              style={{
                borderColor: "#e5f0ff",
                boxShadow: "0 10px 28px rgba(20,50,110,0.14)",
              }}
            >
              <div className="flex h-[260px] items-end justify-center overflow-hidden bg-[#f7fbff] sm:h-[280px] xl:h-[280px]">
                <img
                  src={lpSectionAsset(worry.src)}
                  alt=""
                  role="presentation"
                  className="h-full w-full object-cover object-top"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="px-6 pb-6 pt-5">
                <h3 className="text-[20px] font-black leading-snug" style={{ color: "var(--lp-cta)" }}>
                  {worry.title}
                </h3>
                <div className="mx-auto my-3 h-1 w-9 rounded-full" style={{ background: "var(--lp-cta)" }} />
                <p className="text-[15px] font-medium leading-[1.75]" style={{ color: "var(--lp-muted-text)" }}>
                  {worry.text}
                </p>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-[20px] font-black leading-relaxed sm:text-[26px]" style={{ color: "var(--lp-navy)" }}>
          <span style={{ color: "var(--lp-cta)" }}>就活Pass</span>なら、悩みをひとつずつ整理して
          <span style={{ color: "var(--lp-cta)" }}>前に進めます。</span>
        </p>
      </div>
    </section>
  );
}
