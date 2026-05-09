import { Fragment } from "react";
import { Building2, CalendarCheck, FileText, MessageSquare } from "lucide-react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";

const steps = [
  {
    number: "1",
    icon: Building2,
    title: "企業を登録",
    body: "気になる企業を追加して、管理をスタート。",
    src: "how-to/processed/step-register-company-nobg.png",
    footer: "気になる企業をすぐに登録。情報を一元管理できます。",
  },
  {
    number: "2",
    icon: FileText,
    title: "AIでESを作成・添削",
    body: "志望動機やガクチカを整理しながら、文章をブラッシュアップ。",
    src: "how-to/processed/step-ai-es-review-nobg.png",
    footer: "AIが内容を添削し、伝わるESに仕上げることができます。",
  },
  {
    number: "3",
    icon: MessageSquare,
    title: "面接対策を進める",
    body: "LLMとのチャットで模擬面接を進め、受け答えを改善。",
    src: "how-to/processed/step-interview-prep-nobg.png",
    footer: "AIが回答を分析し、改善点や強みをフィードバックします。",
  },
  {
    number: "4",
    icon: CalendarCheck,
    title: "締切・予定を管理",
    body: "カレンダー連携で、予定や締切をひと目で確認。",
    src: "how-to/processed/step-deadline-schedule-nobg.png",
    footer: "締切や面接予定をまとめて管理。うっかり忘れを防げます。",
  },
] as const;

const sparkles = [
  { x: 5, y: 8, size: 14, opacity: 0.35, color: "#b9d8ff" },
  { x: 88, y: 12, size: 10, opacity: 0.3, color: "#78b5ff" },
  { x: 15, y: 72, size: 12, opacity: 0.25, color: "#d3e5ff", type: "dot" as const },
  { x: 92, y: 65, size: 16, opacity: 0.3, color: "#b9d8ff" },
  { x: 48, y: 5, size: 8, opacity: 0.4, color: "#78b5ff", type: "dot" as const },
] as const;

export function HowToUseSection() {
  return (
    <section
      id="how-it-works"
      data-section="how-it-works"
      className="relative scroll-mt-[92px] overflow-hidden bg-white"
      style={{
        padding: "60px 0 56px",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px] w-full" viewBox="0 0 1440 130" preserveAspectRatio="none" aria-hidden>
        <path d="M0 90 C 180 30, 320 80, 480 70 S 760 40, 920 80 1240 100, 1440 60 L1440 130 L0 130 Z" fill="#e2ecff" opacity="0.55" />
        <path d="M0 100 C 200 70, 380 110, 560 95 S 820 70, 1000 100 1280 120, 1440 90 L1440 130 L0 130 Z" fill="#cfdcf7" opacity="0.35" />
        <path d="M0 70 C 200 30, 380 90, 600 70 S 1000 40, 1240 80 1380 70, 1440 65" fill="none" stroke="#7aa3ef" strokeWidth="1.4" strokeLinecap="round" />
      </svg>

      <LpSparkleDecorations sparkles={sparkles} />

      <div className="relative z-10 mx-auto max-w-[1540px] px-6 sm:px-10 lg:px-12 xl:px-14">
        <div className="mb-7 text-center sm:mb-8">
          <h2 className="text-[36px] font-black leading-[1.08] sm:text-[48px] lg:text-[56px]" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
            使い方は、<span style={{ color: "var(--lp-cta)" }}>シンプル。</span>
          </h2>
          <p className="mt-3 text-[16px] font-medium" style={{ color: "var(--lp-muted-text)" }}>
            就活の流れに沿って、必要な準備を自然につなげられます。
          </p>
        </div>

        <div className="grid gap-3 xl:grid-cols-4 xl:gap-5">
          {steps.map((step, index) => (
            <Fragment key={step.number}>
              <article
                className="relative rounded-2xl border bg-white"
                style={{ borderColor: "#d8eaff", boxShadow: "0 10px 30px rgba(20,50,110,0.13)" }}
              >
                {index < steps.length - 1 ? (
                  <span className="absolute right-[-20px] top-1/2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center xl:flex" aria-hidden>
                    <span className="h-[2px] flex-1" style={{ background: "var(--lp-cta)" }} />
                    <span className="h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent" style={{ borderLeftColor: "var(--lp-cta)" }} />
                  </span>
                ) : null}
                <div className="flex items-center gap-2.5 px-4 pt-4">
                  <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full text-[20px] font-black text-white" style={{ background: "var(--lp-cta)" }}>
                    {step.number}
                  </span>
                  <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border bg-white" style={{ borderColor: "#d8eaff", color: "var(--lp-cta)" }}>
                    <step.icon className="h-6 w-6" aria-hidden />
                  </span>
                  <h3 className="text-[18px] font-black leading-snug" style={{ color: "var(--lp-cta)" }}>
                    {step.title}
                  </h3>
                </div>
                <p className="px-4 pb-0 pt-0 text-[15px] font-medium leading-[1.45]" style={{ color: "var(--lp-navy)" }}>
                  {step.body}
                </p>
                <div className="mx-3 flex h-[270px] items-center justify-center overflow-hidden rounded-[14px] bg-[#f7fbff] sm:h-[300px] xl:h-[270px]">
                  <img src={lpSectionAsset(step.src)} alt="" role="presentation" className="max-h-[292px] w-auto max-w-[112%] object-contain sm:max-h-[322px] xl:max-h-[292px]" loading="lazy" decoding="async" />
                </div>
                <div className="mx-3 mb-2 mt-0 rounded-[12px] border bg-white px-3 py-1.5" style={{ borderColor: "#d8eaff" }}>
                  <p className="text-[14px] font-bold leading-[1.5]" style={{ color: "var(--lp-navy)" }}>
                    {step.footer}
                  </p>
                </div>
              </article>
              {index < steps.length - 1 && (
                <div className="flex flex-col items-center py-1 xl:hidden" aria-hidden>
                  <span className="h-6 w-[2px]" style={{ background: "var(--lp-cta)" }} />
                  <span className="h-0 w-0 border-x-[7px] border-t-[11px] border-x-transparent" style={{ borderTopColor: "var(--lp-cta)" }} />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <p className="mt-8 text-center text-[22px] font-black leading-relaxed sm:text-[28px]" style={{ color: "var(--lp-navy)" }}>
          <span style={{ color: "var(--lp-cta)" }}>準備・対策・管理</span>まで、就活Passひとつで完結。
        </p>
      </div>
    </section>
  );
}
