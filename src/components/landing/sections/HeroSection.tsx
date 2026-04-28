import Image from "next/image";
import Link from "next/link";
import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";

const ASSET = LP_ASSET_BASE;

const trustBadges = [
  {
    icon: `${ASSET}/icons-circled/credit-card.png`,
    alt: "クレジットカード不要アイコン",
    text: "クレカ登録不要",
  },
  {
    icon: `${ASSET}/icons-circled/devices.png`,
    alt: "スマートフォンとPCのアイコン",
    text: "スマホ・PC対応",
  },
  {
    icon: `${ASSET}/icons-circled/graduation.png`,
    alt: "安心のセキュリティアイコン",
    text: "安心のセキュリティ",
  },
] as const;

export function HeroSection() {
  return (
    <section
      className="relative w-full overflow-hidden bg-white lg:min-h-[900px]"
      style={{
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
        background:
          "radial-gradient(circle at 88% 8%, rgba(37, 99, 235, 0.11), transparent 22%), linear-gradient(180deg, #f9fbff 0%, #ffffff 74%)",
      }}
    >
      <img
        src={`${ASSET}/decorative/curved-lines-dot.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-0 top-0 hidden w-[760px] opacity-35 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/blue-circle-lg.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[-70px] top-[105px] hidden w-[330px] opacity-20 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/dot-pattern-2.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[4%] top-[43%] hidden w-[150px] opacity-55 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/wave-line-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-35 2xl:block"
      />

      <div className="relative z-10 mx-auto grid max-w-[1580px] px-5 pb-16 pt-10 sm:px-8 2xl:grid-cols-[700px_1fr] 2xl:px-0 2xl:pb-0 2xl:pt-12">
        <div className="text-center 2xl:text-left">
          <div className="mb-16 flex items-center justify-center gap-4 2xl:mb-[86px] 2xl:justify-start">
            <img
              src={`${ASSET}/branding/compass-icon-navy.png`}
              alt=""
              role="presentation"
              width={60}
              height={60}
              className="h-[46px] w-[46px] object-contain 2xl:h-[60px] 2xl:w-[60px]"
            />
            <span
              className="text-[28px] leading-none lg:text-[40px]"
              style={{ color: "var(--lp-navy)", fontWeight: 800 }}
            >
              就活Pass
            </span>
          </div>

          <h1
            className="mx-auto max-w-[700px] 2xl:mx-0"
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(44px, 4.8vw, 76px)",
              fontWeight: 800,
              letterSpacing: "0",
              lineHeight: 1.12,
            }}
          >
            <span className="block">就活の不安を、</span>
            <span className="block 2xl:whitespace-nowrap">
              <span style={{ color: "var(--lp-cta)" }}>AIで一つずつ</span>
              <span>解決。</span>
            </span>
          </h1>

          <p
            className="mx-auto mt-8 max-w-[620px] 2xl:mx-0"
            style={{
              color: "var(--lp-muted-text)",
              fontSize: "22px",
              lineHeight: 1.75,
            }}
          >
            ES添削・志望動機作成・面接対策・締切管理まで。
            <br />
            就活に必要なすべてを、就活Passでひとつに。
          </p>

          <div className="mt-12 flex flex-col justify-center gap-5 sm:flex-row 2xl:justify-start">
            <Link
              href="/login"
              className="inline-flex h-[74px] min-w-[292px] items-center justify-center gap-5 rounded-[10px] text-[22px] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 2xl:h-[82px]"
              style={{
                backgroundColor: "var(--lp-cta)",
                fontWeight: 800,
                outlineColor: "rgba(37, 99, 235, 0.50)",
              }}
            >
              無料で始める
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="#features"
              className="inline-flex h-[74px] min-w-[272px] items-center justify-center gap-5 rounded-[10px] border-2 bg-white text-[22px] transition-colors hover:bg-[#eef4ff] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 2xl:h-[82px]"
              style={{
                borderColor: "var(--lp-cta)",
                color: "var(--lp-cta)",
                fontWeight: 800,
                outlineColor: "rgba(37, 99, 235, 0.50)",
              }}
            >
              機能を見る
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="mt-[86px] flex flex-wrap justify-center gap-x-9 gap-y-5 2xl:justify-start">
            {trustBadges.map((badge) => (
              <span
                key={badge.text}
                className="inline-flex items-center gap-3 text-[16px]"
                style={{ color: "var(--lp-muted-text)", fontWeight: 600 }}
              >
                <img
                  src={badge.icon}
                  alt={badge.alt}
                  width={50}
                  height={50}
                  className="h-[50px] w-[50px] rounded-full object-contain"
                />
                {badge.text}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mt-10 min-h-[430px] 2xl:mt-0 2xl:min-h-[800px]">
          <Image
            src={`${ASSET}/mockups/laptop-dashboard.png`}
            alt="就活Passのダッシュボード画面"
            width={1448}
            height={1086}
            className="absolute left-1/2 top-0 h-auto w-[95vw] max-w-none -translate-x-1/2 rounded-xl 2xl:left-[18px] 2xl:top-[138px] 2xl:w-[910px] 2xl:translate-x-0"
            sizes="(max-width: 1024px) 95vw, 910px"
            priority
            style={{
              filter: "drop-shadow(0 30px 56px rgba(10, 15, 92, 0.20))",
            }}
          />
          <Image
            src={`${ASSET}/mockups/iphone-app.png`}
            alt="就活Passのスマートフォン画面"
            width={1086}
            height={1448}
            className="absolute right-[6%] top-[33%] h-auto w-[24vw] max-w-[190px] drop-shadow-xl 2xl:right-[22px] 2xl:top-[304px] 2xl:w-[190px]"
            sizes="(max-width: 1024px) 24vw, 190px"
            priority
          />
        </div>
      </div>
    </section>
  );
}
