"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Clock3, FileCheck2, FileText, Smile, UserRoundCheck, Workflow } from "lucide-react";
import { lpSectionAsset, LP_SECTION_ASSETS } from "@/lib/assets/image-registry";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";

const STAGE_W = 1440;
const STAGE_H = 540;

const beforeItems = [
  { icon: Workflow, text: "やることが多くて、何から手をつければいいか分からない" },
  { icon: FileText, text: "ES作成・面接対策・締切管理がバラバラ" },
  { icon: Clock3, text: "情報収集や企業管理に時間がかかる" },
  { icon: UserRoundCheck, text: "面接前に不安が残り、自信が持ちづらい" },
] as const;

const afterItems = [
  { icon: CheckCircle2, text: "AIが次にやることを整理してくれる" },
  { icon: FileCheck2, text: "ES・面接・締切をひとつにまとめて管理できる" },
  { icon: BarChart3, text: "企業情報や進捗が見やすくなり、効率的に進められる" },
  { icon: Smile, text: "練習と準備が整い、自信を持って本番に向かえる" },
] as const;

const sparkles = [
  { x: 3, y: 10, size: 12, opacity: 0.35, color: "#b9d8ff" },
  { x: 95, y: 8, size: 16, opacity: 0.3, color: "#78b5ff" },
  { x: 42, y: 5, size: 10, opacity: 0.4, color: "#d3e5ff", type: "dot" as const },
  { x: 8, y: 75, size: 14, opacity: 0.25, color: "#b9d8ff" },
  { x: 55, y: 85, size: 8, opacity: 0.35, color: "#78b5ff", type: "dot" as const },
] as const;

function useStageScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const width = node.getBoundingClientRect().width;
      setScale(Math.min(1, width / STAGE_W));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, scale };
}

function BeforeAfterArrow({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const isVertical = orientation === "vertical";

  if (isVertical) {
    return (
      <span className="flex h-[80px] items-center justify-center sm:h-[118px]" aria-hidden>
        <svg width="92" height="118" viewBox="0 0 92 168" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="ba-arrow-shadow-vertical" x="0" y="0" width="92" height="168" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2680ff" floodOpacity="0.22" />
            </filter>
          </defs>
          <path d="M25 18V101H8L46 158L84 101H67V18Z" fill="var(--lp-cta)" filter="url(#ba-arrow-shadow-vertical)" />
        </svg>
      </span>
    );
  }

  return (
    <span className="flex w-[168px] items-center justify-center" aria-hidden>
      <svg
        width={168}
        height={92}
        viewBox="0 0 168 92"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="ba-arrow-shadow-horizontal" x="0" y="0" width="168" height="92" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2680ff" floodOpacity="0.22" />
          </filter>
        </defs>
        <path d="M18 25H101V8L158 46L101 84V67H18Z" fill="var(--lp-cta)" filter="url(#ba-arrow-shadow-horizontal)" />
      </svg>
    </span>
  );
}

export function BeforeAfterSection() {
  const { ref, scale } = useStageScale();

  return (
    <section
      id="before-after"
      data-section="before-after"
      className="relative overflow-hidden py-10 sm:py-[52px] lg:pt-[62px] lg:pb-[54px]"
      style={{
        background: "linear-gradient(180deg, #fff 0%, #f4f8ff 100%)",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-[126px] w-full" viewBox="0 0 1440 130" preserveAspectRatio="none" aria-hidden>
        <path d="M0 90 C 180 30, 320 80, 480 70 S 760 40, 920 80 1240 100, 1440 60 L1440 130 L0 130 Z" fill="#e2ecff" opacity="0.55" />
        <path d="M0 100 C 200 70, 380 110, 560 95 S 820 70, 1000 100 1280 120, 1440 90 L1440 130 L0 130 Z" fill="#cfdcf7" opacity="0.35" />
      </svg>

      <LpSparkleDecorations sparkles={sparkles} />

      <div className="relative z-10 mx-auto max-w-[1580px] px-6 sm:px-10 lg:px-12 xl:px-14">
        <h2 className="text-center text-[32px] font-black leading-tight sm:text-[44px] lg:text-[52px]" style={{ color: "var(--lp-navy)", letterSpacing: "0" }}>
          就活Passで、<span style={{ color: "var(--lp-cta)" }}>ここまで変わる。</span>
        </h2>

        <div ref={ref} className="mt-8 hidden overflow-visible min-[1360px]:block">
          <div style={{ height: STAGE_H * scale }}>
            <div
              className="relative origin-top-left"
              style={{
                width: STAGE_W,
                height: STAGE_H,
                transform: `scale(${scale})`,
              }}
            >
              <div
                className="absolute left-0 top-0 h-[500px] w-[580px] overflow-hidden rounded-[22px] border bg-white"
                style={{ borderColor: "#d8d8d8", boxShadow: "0 10px 30px rgba(20,50,110,0.12)" }}
              >
                <span className="absolute left-10 top-8 z-20 rounded-full px-3.5 py-1 text-[14px] font-black text-white" style={{ background: "#8a8f96" }}>
                  Before
                </span>
                <img src={lpSectionAsset(LP_SECTION_ASSETS.beforeAfter.personWorried)} alt="" role="presentation" className="absolute bottom-[-10px] left-[-38px] z-10 h-[400px] w-auto" loading="eager" decoding="async" />
                <div className="absolute right-7 top-16 z-20 w-[310px] rounded-[18px] bg-white/88 p-5">
                  {beforeItems.map(({ icon: Icon, text }) => (
                    <div key={text} className="flex min-h-[78px] items-center gap-4 border-b last:border-b-0" style={{ borderColor: "#dedede" }}>
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "#dddddd", color: "#3a3f47" }}>
                        <Icon className="h-7 w-7" aria-hidden />
                      </span>
                      <p className="text-[18px] font-black leading-[1.48]" style={{ color: "#3a3f47" }}>
                        {text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <span className="absolute left-[586px] top-[204px] z-20 flex w-[168px] items-center justify-center" aria-hidden>
                <BeforeAfterArrow orientation="horizontal" />
              </span>

              <div
                className="absolute right-0 top-0 h-[500px] w-[650px] overflow-hidden rounded-[22px] border bg-[#f8fbff]"
                style={{ borderColor: "#a9d0ff", boxShadow: "0 10px 30px rgba(38,128,255,0.14)" }}
              >
                <span className="absolute left-10 top-8 z-20 rounded-full px-3.5 py-1 text-[14px] font-black text-white" style={{ background: "var(--lp-cta)" }}>
                  After
                </span>
                <img src={lpSectionAsset(LP_SECTION_ASSETS.beforeAfter.personCheerful)} alt="" role="presentation" className="absolute bottom-[-20px] left-[-6px] z-10 h-[370px] w-auto opacity-95" loading="eager" decoding="async" />
                <div className="absolute right-7 top-20 z-20 w-[330px] rounded-[18px] bg-white/90 p-5">
                  {afterItems.map(({ icon: Icon, text }) => (
                    <div key={text} className="flex min-h-[78px] items-center gap-4 border-b last:border-b-0" style={{ borderColor: "#b9d8ff" }}>
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "#b9d8ff", color: "var(--lp-cta)" }}>
                        <Icon className="h-7 w-7" aria-hidden />
                      </span>
                      <p className="text-[18px] font-black leading-[1.48]" style={{ color: "var(--lp-cta)" }}>
                        {text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 min-[1360px]:hidden">
          {[
            { label: "Before", tone: "#8a8f96", textColor: "#3a3f47", src: LP_SECTION_ASSETS.beforeAfter.personWorried, items: beforeItems },
            { label: "After", tone: "var(--lp-cta)", textColor: "var(--lp-navy)", src: LP_SECTION_ASSETS.beforeAfter.personCheerful, items: afterItems },
          ].map((panel, index) => (
            <Fragment key={panel.label}>
              <article className="overflow-hidden rounded-[22px] border bg-white" style={{ borderColor: "#d8eaff" }}>
                <div className="px-6 pt-6">
                  <span className="rounded-full px-3.5 py-1 text-[14px] font-black text-white" style={{ background: panel.tone }}>
                    {panel.label}
                  </span>
                </div>
                <img src={lpSectionAsset(panel.src)} alt="" role="presentation" className="mx-auto mt-4 h-[200px] w-auto object-contain sm:h-[280px]" loading="lazy" decoding="async" />
                <div className="px-6 pb-6">
                  {panel.items.map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-4 border-b py-4 last:border-b-0" style={{ borderColor: "#d8eaff" }}>
                      <Icon className="h-7 w-7 shrink-0" style={{ color: panel.tone }} aria-hidden />
                      <p className="text-[17px] font-bold leading-[1.55]" style={{ color: panel.textColor }}>
                        {text}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
              {index === 0 && (
                <div className="flex flex-col items-center py-1" aria-hidden>
                  <BeforeAfterArrow orientation="vertical" />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <p className="mt-8 text-center text-[22px] font-black leading-relaxed sm:text-[28px]" style={{ color: "var(--lp-navy)" }}>
          就活の準備を、<span style={{ color: "var(--lp-cta)" }}>迷わず・着実に進める</span>ためのオールインワン。
        </p>
      </div>
    </section>
  );
}
