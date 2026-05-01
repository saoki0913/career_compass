import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MonitorSmartphone, ShieldCheck, Sparkles } from "lucide-react";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";

const trustBadges = [
  {
    icon: Sparkles,
    text: "無料プランあり",
  },
  {
    icon: MonitorSmartphone,
    text: "スマホ・PC対応",
  },
  {
    icon: ShieldCheck,
    text: "安心のセキュリティ",
  },
] as const;

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-white"
      style={{
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
        padding: "112px 0 80px",
      }}
    >
      {/* Scoped responsive + hover rules (keyframes in globals.css) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.hero__grid{display:grid;grid-template-columns:1fr;gap:30px;align-items:center}
@media(min-width:901px){.hero__grid{grid-template-columns:minmax(420px,500px) minmax(0,1fr)}}
@media(min-width:901px) and (max-width:1100px){.hero__grid{grid-template-columns:minmax(360px,440px) 1fr;gap:16px}}
@media(max-width:1100px){.hero__title-text{font-size:44px!important}}
@media(max-width:640px){.hero__title-text{font-size:36px!important}}
@media(max-width:900px){.hero__mockup-wrap{margin-right:0!important}}
.hero__btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 28px rgba(38,128,255,0.45),inset 0 1px 0 rgba(255,255,255,0.25)!important}
.hero__btn-ghost:hover{transform:translateY(-2px);background:#e8f1ff!important}
.hero__btn-primary:hover .hero__arrow,.hero__btn-ghost:hover .hero__arrow{transform:translateX(4px)}
.hero__arrow{transition:transform 0.2s ease}
.hero__trust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;max-width:500px}
.hero__trust-pill{transition:transform 0.2s ease,box-shadow 0.2s ease}
.hero__trust-pill:hover{transform:translateY(-2px);box-shadow:0 12px 24px rgba(38,128,255,0.13)!important}
.hero__trust-pill__label{white-space:nowrap}
@media(max-width:640px){.hero__trust-grid{gap:5px}.hero__trust-pill{gap:5px!important;padding:7px 5px!important}.hero__trust-pill__icon{height:24px!important;width:24px!important}.hero__trust-pill__label{font-size:10px!important;line-height:1.1!important}.hero__trust-pill__check{display:none!important}}
`,
        }}
      />

      {/* ---- Background gradient blobs ---- */}
      <div
        className="pointer-events-none absolute"
        aria-hidden="true"
        style={{
          top: -160,
          right: -200,
          width: 720,
          height: 720,
          borderRadius: "50%",
          background: "rgba(106,169,255,0.18)",
          filter: "blur(80px)",
        }}
      />
      <div
        className="pointer-events-none absolute"
        aria-hidden="true"
        style={{
          top: 220,
          left: -200,
          width: 540,
          height: 540,
          borderRadius: "50%",
          background: "rgba(38,128,255,0.10)",
          filter: "blur(80px)",
        }}
      />

      {/* ---- Decorative SVG squiggles + dots ---- */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M 50 320 C 120 290, 180 380, 240 340 S 360 290, 420 330"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M 30 540 C 90 510, 150 590, 210 560 S 320 520, 380 550"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M 850 90 C 940 60, 1020 130, 1110 100 S 1280 70, 1360 100"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="2 6"
          opacity="0.7"
        />
        <path
          d="M 60 720 C 150 700, 230 760, 320 740"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="2 6"
          opacity="0.55"
        />
        <circle cx="400" cy="120" r="3" fill="#bcd4ff" opacity="0.7" />
        <circle cx="780" cy="60" r="3" fill="#bcd4ff" opacity="0.6" />
        <circle cx="1180" cy="220" r="3" fill="#bcd4ff" opacity="0.6" />
        <circle cx="1330" cy="380" r="3" fill="#bcd4ff" opacity="0.6" />
        <circle cx="540" cy="700" r="3" fill="#bcd4ff" opacity="0.6" />
      </svg>

      {/* ---- Floating decorative icons ---- */}
      <img
        src={lpSectionAsset("hero/icon-growth-chart.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{
          top: 30,
          left: "56%",
          width: 64,
          animation: "lp-floaty 7s ease-in-out infinite",
        }}
      />
      <img
        src={lpSectionAsset("hero/icon-star.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{
          top: 90,
          left: "70%",
          width: 56,
          animation: "lp-floaty 6s ease-in-out infinite 1s",
        }}
      />
      <img
        src={lpSectionAsset("hero/icon-document-check.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{
          top: 30,
          left: "86%",
          width: 70,
          animation: "lp-floaty 8s ease-in-out infinite 0.5s",
        }}
      />

      {/* ---- Main content ---- */}
      <div
        className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8"
        style={{ paddingTop: 30 }}
      >
        <div className="hero__grid">
          {/* ---- Left column: copy + CTA ---- */}
          <div className="text-center lg:text-left">
            <h1
              className="hero__title-text mx-auto lg:mx-0"
              style={{
                fontSize: 56,
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
                color: "var(--lp-navy)",
                margin: "0 0 24px",
              }}
            >
              {"就活の不安を、"}
              <br />
              <span
                style={{
                  color: "var(--lp-cta)",
                  display: "inline-block",
                  position: "relative",
                }}
              >
                AI
                {/* Blue underline bar (pseudo-element equivalent) */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 0,
                    width: "1.6em",
                    height: 4,
                    background: "#2680ff",
                    borderRadius: 2,
                  }}
                />
              </span>
              {"で一つずつ解決。"}
            </h1>

            <p
              className="mx-auto lg:mx-0"
              style={{
                fontSize: 16,
                lineHeight: 1.95,
                color: "#4b5563",
                margin: "0 0 36px",
                fontWeight: 500,
                maxWidth: 520,
              }}
            >
              ES添削・志望動機作成・面接対策・締切管理まで。
              <br className="hidden sm:block" />
              就活の主要な準備を、就活Passでひとつに。
            </p>

            {/* ---- CTA buttons ---- */}
            <div
              className="flex flex-col items-center gap-4 sm:flex-row lg:justify-start"
              style={{ gap: 16, marginBottom: 44 }}
            >
              {/* Primary CTA */}
              <Link
                href="/login"
                className="hero__btn-primary inline-flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  gap: 18,
                  padding: "20px 28px 20px 36px",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  minWidth: 240,
                  background:
                    "linear-gradient(180deg, #3a91ff 0%, #1f78ec 100%)",
                  color: "#fff",
                  boxShadow:
                    "0 10px 22px rgba(38,128,255,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                  outlineColor: "rgba(38,128,255,0.45)",
                }}
              >
                <span>無料で始める</span>
                <span
                  className="hero__arrow flex items-center justify-center"
                  aria-hidden="true"
                >
                  <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
                </span>
              </Link>

              {/* Ghost CTA */}
              <Link
                href="#features"
                className="hero__btn-ghost inline-flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  gap: 18,
                  padding: "20px 28px 20px 36px",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  minWidth: 240,
                  background: "#fff",
                  color: "#2680ff",
                  border: "2px solid #2680ff",
                  boxShadow: "0 6px 14px rgba(38,128,255,0.12)",
                  outlineColor: "rgba(38,128,255,0.45)",
                }}
              >
                <span>機能を見る</span>
                <span
                  className="hero__arrow flex items-center justify-center"
                  aria-hidden="true"
                >
                  <ArrowRight className="h-5 w-5" strokeWidth={2.4} />
                </span>
              </Link>
            </div>

            {/* ---- Trust badges ---- */}
            <div
              className="hero__trust-grid mx-auto lg:mx-0"
            >
              {trustBadges.map((badge) => {
                const Icon = badge.icon;
                return (
                <span
                  key={badge.text}
                  className="hero__trust-pill inline-flex items-center"
                  style={{
                    gap: 8,
                    minWidth: 0,
                    minHeight: 38,
                    padding: "4px 12px 4px 5px",
                    borderRadius: 999,
                    background: "#fff",
                    border: "1px solid #dce9ff",
                    boxShadow: "0 6px 16px rgba(38,128,255,0.07)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="hero__trust-pill__icon inline-flex shrink-0 items-center justify-center"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      background: "linear-gradient(180deg, #4a98ff 0%, #2680ff 100%)",
                      color: "#fff",
                      boxShadow: "0 4px 10px rgba(38,128,255,0.22)",
                    }}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
                  </span>
                  <span
                    className="hero__trust-pill__label"
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#1d2c4d",
                      letterSpacing: "0.01em",
                      lineHeight: 1.2,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {badge.text}
                  </span>
                  <Check className="hero__trust-pill__check h-3.5 w-3.5 shrink-0 text-[#2680ff]" strokeWidth={2.4} aria-hidden />
                </span>
                );
              })}
            </div>
          </div>

          {/* ---- Right column: mockup ---- */}
          <div className="hero__mockup-wrap relative mx-auto w-full lg:mx-0" style={{ marginRight: -30 }}>
            <Image
              src={lpSectionAsset("hero/product-mockup-pc-phone.png")}
              alt="就活PassのPCとスマートフォン画面"
              width={1448}
              height={1086}
              className="h-auto w-full object-contain"
              sizes="(max-width: 900px) 92vw, 720px"
              preload
              style={{
                maxWidth: 720,
                filter:
                  "drop-shadow(0 20px 50px rgba(20,50,110,0.18))",
                animation: "lp-hero-float 6s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
