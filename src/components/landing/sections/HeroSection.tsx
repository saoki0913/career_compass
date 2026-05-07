import Link from "next/link";
import { ArrowRight, Check, MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";
import { LpSparkleDecorations } from "@/components/landing/shared/LpSparkleDecorations";

const trustBadges = [
  { icon: Sparkles, label: "無料プランあり" },
  { icon: MonitorSmartphone, label: "スマホ・PC対応" },
  { icon: ShieldCheck, label: "安心のセキュリティ" },
] as const;

const heroSparkles = [
  { x: 8, y: 15, size: 14, opacity: 0.3, color: "#b9d8ff" },
  { x: 22, y: 70, size: 10, opacity: 0.25, color: "#78b5ff", type: "dot" as const },
  { x: 65, y: 8, size: 12, opacity: 0.35, color: "#d3e5ff" },
  { x: 85, y: 55, size: 16, opacity: 0.25, color: "#b9d8ff" },
  { x: 45, y: 88, size: 8, opacity: 0.3, color: "#78b5ff", type: "dot" as const },
] as const;

export function HeroSection() {
  return (
    <section
      data-section="hero"
      className="relative overflow-hidden bg-white"
      style={{
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
        padding: "90px 0 42px",
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1672 941"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M960 128 C1070 42 1220 128 1350 74 C1448 34 1542 58 1630 18"
          fill="none"
          stroke="#b9d8ff"
          strokeDasharray="8 12"
          strokeWidth="2"
        />
        <path
          d="M0 824 C215 735 315 890 528 800 C740 714 842 844 1010 794 C1230 728 1396 832 1672 724"
          fill="none"
          stroke="#b9d8ff"
          strokeWidth="2"
        />
        <path
          d="M0 886 C230 792 390 918 615 836 C820 760 1030 900 1235 824 C1420 754 1505 814 1672 762"
          fill="none"
          stroke="#d3e5ff"
          strokeWidth="1.5"
        />
        <circle cx="208" cy="828" r="14" fill="#78b5ff" />
        <circle cx="560" cy="816" r="10" fill="#78b5ff" />
        <circle cx="1412" cy="745" r="10" fill="#78b5ff" />
        <circle cx="1480" cy="802" r="7" fill="#78b5ff" />
        <circle cx="1458" cy="254" r="8" fill="#78b5ff" />
        <circle cx="640" cy="650" r="180" fill="#eaf3ff" opacity="0.72" />
        <circle cx="1508" cy="180" r="185" fill="#eaf3ff" opacity="0.86" />
      </svg>

      <LpSparkleDecorations sparkles={heroSparkles} />

      <img
        src={lpSectionAsset("hero/icon-growth-chart.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ right: "34%", top: 138, width: 76, opacity: 0.72 }}
      />
      <img
        src={lpSectionAsset("hero/icon-star.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ right: "16%", top: 154, width: 86, opacity: 0.72 }}
      />
      <img
        src={lpSectionAsset("hero/icon-document-check.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{ right: 62, top: 148, width: 92, opacity: 0.72 }}
      />

      <div className="relative z-10 mx-auto grid max-w-[1572px] items-center gap-6 px-6 sm:px-10 lg:grid-cols-[600px_minmax(0,1fr)] lg:px-12 xl:px-14">
        <div className="pt-8 text-center lg:pt-14 lg:text-left">
          <h1
            className="mx-auto max-w-[600px] text-[40px] font-black leading-[1.22] sm:text-[54px] lg:mx-0 lg:text-[64px]"
            style={{
              color: "var(--lp-navy)",
              letterSpacing: "0",
            }}
          >
            就活の不安を、
            <br />
            <span className="relative inline-block" style={{ color: "var(--lp-cta)" }}>
              AIで一つずつ
              <span
                aria-hidden="true"
                className="absolute left-0 right-0"
                style={{
                  bottom: 4,
                  height: 5,
                  borderRadius: 999,
                  background: "var(--lp-cta)",
                  opacity: 0.9,
                }}
              />
            </span>
            解決。
          </h1>

          <p
            className="mx-auto mt-6 max-w-[540px] text-[16px] font-medium leading-[1.85] lg:mx-0 lg:text-[18px]"
            style={{ color: "var(--lp-navy)" }}
          >
            ES添削・志望動機作成・面接対策・締切管理まで。
            <br className="hidden sm:block" />
            就活に必要なすべてを、就活Passでひとつに。
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
            <Link
              href="/login"
              className="group inline-flex min-h-[60px] w-full max-w-[248px] items-center justify-center gap-3 rounded-[12px] text-[17px] font-bold text-white transition-transform duration-200 hover:-translate-y-0.5 sm:w-[248px]"
              style={{
                background: "linear-gradient(180deg, #0c82ff 0%, #0069e6 100%)",
                boxShadow: "0 14px 28px rgba(38,128,255,0.34)",
              }}
            >
              無料で始める
              <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link
              href="#features"
              className="group inline-flex min-h-[60px] w-full max-w-[248px] items-center justify-center gap-3 rounded-[12px] border-2 bg-white text-[17px] font-bold transition-transform duration-200 hover:-translate-y-0.5 sm:w-[248px]"
              style={{ borderColor: "var(--lp-cta)", color: "var(--lp-cta)" }}
            >
              機能を見る
              <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>

          <div className="mt-9 grid max-w-[520px] grid-cols-3 gap-3">
            {trustBadges.map(({ icon: Icon, label }) => (
              <div key={label} className="hero__trust-pill flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-full bg-white px-2 sm:min-h-[56px] sm:flex-row sm:gap-2 sm:px-3">
                <span
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full border sm:h-[42px] sm:w-[42px]"
                  style={{ borderColor: "#d7e8ff", color: "var(--lp-cta)" }}
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                </span>
                <span className="text-center text-[10px] font-bold leading-tight sm:text-[12px]" style={{ color: "var(--lp-navy)" }}>
                  {label}
                </span>
                <Check className="hidden h-4 w-4 sm:block" style={{ color: "var(--lp-cta)" }} aria-hidden />
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-h-[340px] sm:min-h-[440px] lg:min-h-[600px]">
          <img
            src={lpSectionAsset("hero/product-mockup-pc-phone.png")}
            alt="就活Passのダッシュボード画面"
            className="absolute bottom-0 left-1/2 w-[112%] max-w-[920px] -translate-x-1/2 object-contain lg:left-[45%] lg:w-[106%]"
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}
