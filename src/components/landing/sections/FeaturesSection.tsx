import { FilePenLine, MessageCircle, PanelsTopLeft } from "lucide-react";
import { lpSectionAsset, LP_SECTION_ASSETS } from "@/lib/assets/image-registry";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";

const featureSparkles = [
  { x: 6, y: 12, size: 14, opacity: 0.3, color: "#78b5ff" },
  { x: 92, y: 8, size: 10, opacity: 0.35, color: "#b9d8ff" },
  { x: 15, y: 60, size: 12, opacity: 0.25, color: "#d3e5ff", type: "dot" as const },
  { x: 88, y: 72, size: 16, opacity: 0.3, color: "#b9d8ff" },
  { x: 50, y: 90, size: 8, opacity: 0.25, color: "#78b5ff", type: "dot" as const },
] as const;

const flowSteps = [
  { icon: FilePenLine, title: "作成", text: "AIで効率的に作成" },
  { icon: MessageCircle, title: "対策", text: "AIで万全の準備" },
  { icon: PanelsTopLeft, title: "管理", text: "スケジュールを一元管理" },
] as const;

const features = [
  { src: LP_SECTION_ASSETS.features.cardEsReview, alt: "01 ES添削AI" },
  { src: LP_SECTION_ASSETS.features.cardMotivationGakuchika, alt: "02 志望動機・ガクチカ作成" },
  { src: LP_SECTION_ASSETS.features.cardInterviewPrep, alt: "03 AI模擬面接" },
  { src: LP_SECTION_ASSETS.features.cardScheduleDeadline, alt: "04 締切・選考管理" },
  { src: LP_SECTION_ASSETS.features.cardCompanyManagement, alt: "05 企業管理・応募管理" },
  { src: LP_SECTION_ASSETS.features.googleCalendar, alt: "06 Googleカレンダー連携" },
] as const;

export function FeaturesSection() {
  return (
    <section
      id="features"
      data-section="features"
      className="relative scroll-mt-[92px] overflow-hidden py-10 sm:py-[52px] lg:py-[62px]"
      style={{
        background: "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden>
        <path d="M1230 136 C1372 72 1488 160 1672 92" fill="none" stroke="#c9e0ff" strokeWidth="2" />
        <path d="M1260 316 H1370 M1260 338 H1370 M1260 360 H1370" stroke="#b8d8ff" strokeDasharray="1 14" strokeLinecap="round" strokeWidth="5" />
        <circle cx="1536" cy="206" r="50" fill="#e8f2ff" />
      </svg>

      <LpSparkleDecorations sparkles={featureSparkles} />

      <div className="relative z-10 mx-auto max-w-[1590px] px-6 sm:px-10 lg:px-12 xl:px-14">
        <div className="grid items-center gap-7 lg:grid-cols-[500px_minmax(0,1fr)]">
          <div>
            <h2 className="text-[32px] font-black leading-[1.18] sm:text-[44px] lg:text-[52px]" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
              就活を加速させる、
              <br />
              <span className="text-[1.18em]" style={{ color: "var(--lp-cta)" }}>6つ</span>の主要機能
            </h2>
            <p className="mt-4 text-[16px] font-medium leading-[1.75]" style={{ color: "var(--lp-muted-text)" }}>
              書類作成から面接対策、管理まで。必要な準備をひとつにつなぐ。
            </p>
          </div>

          <div
            className="rounded-2xl border bg-white px-5 py-6"
            style={{ borderColor: "#d8eaff", boxShadow: "0 12px 34px rgba(20,50,110,0.12)" }}
          >
            <div className="grid gap-4 md:grid-cols-[1fr_48px_1fr_48px_1fr] md:items-center">
              {flowSteps.map((step, index) => (
                <div key={step.title} className="contents">
                  <div className="flex flex-col items-center text-center">
                    <span
                      className="flex h-[76px] w-[76px] items-center justify-center rounded-full border bg-white"
                      style={{ borderColor: "#d8eaff", boxShadow: "0 14px 28px rgba(38,128,255,0.16)", color: "var(--lp-cta)" }}
                    >
                      <step.icon className="h-9 w-9" aria-hidden />
                    </span>
                    <span className="mt-3 text-[20px] font-black" style={{ color: "var(--lp-cta)" }}>
                      {step.title}
                    </span>
                    <span className="mt-1 text-[15px] font-medium" style={{ color: "var(--lp-navy)" }}>
                      {step.text}
                    </span>
                  </div>
                  {index < flowSteps.length - 1 ? (
                    <div className="hidden items-center md:flex" aria-hidden>
                      <span className="h-1 flex-1 rounded-full border-t-4 border-dotted" style={{ borderColor: "#78b5ff" }} />
                      <span className="ml-1 h-0 w-0 border-y-[8px] border-l-[12px] border-y-transparent" style={{ borderLeftColor: "#78b5ff" }} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.alt}
              className="overflow-hidden rounded-2xl border bg-white"
              style={{ borderColor: "#d8eaff", boxShadow: "0 10px 30px rgba(20,50,110,0.13)" }}
            >
              <div className="flex h-[180px] items-center justify-center bg-white p-3 sm:h-[240px] lg:h-[260px]">
                <img
                  src={lpSectionAsset(feature.src)}
                  alt={feature.alt}
                  className="h-full w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
