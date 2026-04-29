import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { lpAsset } from "@/lib/marketing/lp-assets";

const SHUPASS_ASSET = "shupass-v2";

const trustBadges = [
  {
    icon: lpAsset(`${SHUPASS_ASSET}/badge-cc.png`),
    text: "クレカ登録不要",
  },
  {
    icon: lpAsset(`${SHUPASS_ASSET}/badge-dv.png`),
    text: "スマホ・PC対応",
  },
  {
    icon: lpAsset(`${SHUPASS_ASSET}/badge-sc.png`),
    text: "安心のセキュリティ",
  },
] as const;

function HeroCTA({
  href,
  children,
  variant,
}: {
  href: string;
  children: ReactNode;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <Link
      href={href}
      className="group inline-flex h-[58px] min-w-[196px] items-center justify-center gap-3 rounded-full border px-6 text-[15px] transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-[64px] sm:min-w-[214px] sm:text-[16px] lg:h-[58px] lg:min-w-[188px]"
      style={{
        backgroundColor: isPrimary ? "var(--lp-cta)" : "#ffffff",
        borderColor: "var(--lp-cta)",
        color: isPrimary ? "#ffffff" : "var(--lp-cta)",
        fontWeight: 800,
        boxShadow: isPrimary ? "0 10px 22px rgba(37, 99, 235, 0.26)" : "none",
        outlineColor: "rgba(37, 99, 235, 0.45)",
      }}
    >
      <span>{children}</span>
      <span
        className="flex h-[24px] w-[24px] items-center justify-center rounded-full transition-transform duration-200 group-hover:translate-x-1"
        style={{
          backgroundColor: isPrimary ? "rgba(255, 255, 255, 0.18)" : "var(--lp-tint-cta-soft)",
        }}
        aria-hidden="true"
      >
        <ArrowRight className="h-4 w-4" strokeWidth={2.6} />
      </span>
    </Link>
  );
}

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-white pb-16 pt-6 sm:pb-20 lg:min-h-[760px] lg:pt-7 xl:min-h-[810px]"
      style={{
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
        background:
          "radial-gradient(circle at 92% 10%, rgba(106, 169, 255, 0.18), transparent 24%), radial-gradient(circle at 4% 62%, rgba(37, 99, 235, 0.08), transparent 24%), linear-gradient(180deg, #ffffff 0%, #ffffff 72%, #f8fbff 100%)",
      }}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M50 320 C120 290 180 380 240 340 S360 290 420 330"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M850 90 C940 60 1020 130 1110 100 S1280 70 1360 100"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="2 6"
          opacity="0.7"
        />
        <path
          d="M60 720 C150 700 230 760 320 740"
          stroke="#bcd4ff"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="2 6"
          opacity="0.55"
        />
      </svg>

      <img
        src={lpAsset(`${SHUPASS_ASSET}/icon-chart.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[5%] top-[24%] hidden w-[64px] opacity-80 lg:block"
      />
      <img
        src={lpAsset(`${SHUPASS_ASSET}/icon-star.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[10%] top-[15%] hidden w-[54px] opacity-80 lg:block"
      />
      <img
        src={lpAsset(`${SHUPASS_ASSET}/icon-doc-check.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[6%] top-[52%] hidden w-[66px] opacity-80 lg:block"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-3 lg:mb-12"
          aria-label="就活Pass ホーム"
        >
          <img
            src={lpAsset(`${SHUPASS_ASSET}/logo-icon.png`)}
            alt=""
            role="presentation"
            className="h-[42px] w-[42px] object-contain sm:h-[44px] sm:w-[44px]"
          />
          <span
            className="text-[24px] italic leading-none sm:text-[26px]"
            style={{ color: "var(--lp-cta)", fontWeight: 800 }}
          >
            就活<span className="not-italic">Pass</span>
          </span>
        </Link>

        <div className="grid items-center gap-10 lg:grid-cols-[460px_1fr] lg:gap-7">
          <div className="text-center lg:text-left">
            <h1
              className="mx-auto max-w-[620px] text-[42px] leading-[1.22] sm:text-[52px] lg:mx-0 lg:text-[50px]"
              style={{
                color: "var(--lp-navy)",
                fontWeight: 800,
                letterSpacing: "0",
              }}
            >
              就活の不安を、
              <br />
              <span style={{ color: "var(--lp-cta)" }}>AI</span>
              で一つずつ解決。
            </h1>

            <p
              className="mx-auto mt-6 max-w-[520px] text-[15px] leading-[1.9] sm:text-[16px] lg:mx-0"
              style={{ color: "var(--lp-muted-text)" }}
            >
              ES添削・志望動機作成・面接対策・締切管理まで。
              <br className="hidden sm:block" />
              就活に必要なすべてを、就活Passでひとつに。
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              <HeroCTA href="/login" variant="primary">
                無料で始める
              </HeroCTA>
              <HeroCTA href="#features" variant="secondary">
                機能を見る
              </HeroCTA>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-4 lg:justify-start">
              {trustBadges.map((badge) => (
                <span
                  key={badge.text}
                  className="inline-flex items-center gap-2 text-[12px]"
                  style={{ color: "var(--lp-muted-text)", fontWeight: 700 }}
                >
                  <img
                    src={badge.icon}
                    alt=""
                    role="presentation"
                    className="h-7 w-7 object-contain"
                  />
                  {badge.text}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[720px] lg:max-w-none">
            <Image
              src={lpAsset(`${SHUPASS_ASSET}/mockup-pc-phone.png`)}
              alt="就活PassのPCとスマートフォン画面"
              width={1448}
              height={1086}
              className="h-auto w-full object-contain"
              sizes="(max-width: 1024px) 92vw, 700px"
              preload
              style={{
                filter: "drop-shadow(0 26px 44px rgba(20, 50, 110, 0.16))",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
