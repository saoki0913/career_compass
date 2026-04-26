import Image from "next/image";
import Link from "next/link";

const ASSET = "/marketing/LP/assets";

const trustBadges = [
  {
    icon: `${ASSET}/icons-circled/credit-card.png`,
    alt: "カード不要アイコン",
    text: "カード登録不要",
  },
  {
    icon: `${ASSET}/icons-circled/shield-check.png`,
    alt: "すぐスタートアイコン",
    text: "5分でスタート",
  },
  {
    icon: `${ASSET}/icons-circled/devices.png`,
    alt: "いつでも解約アイコン",
    text: "いつでも解約OK",
  },
] as const;

export function HeroSection() {
  return (
    <section
      className="relative w-full overflow-hidden pb-16 pt-20 lg:min-h-[680px] lg:pb-20 lg:pt-24"
      style={{
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
        background:
          "radial-gradient(circle at 90% 6%, rgba(37, 99, 235, 0.10), transparent 24%), linear-gradient(180deg, var(--lp-hero-gradient-top), var(--lp-hero-gradient-mid))",
      }}
    >
      <img
        src={`${ASSET}/decorative/dot-pattern-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[4%] top-[8%] hidden w-48 opacity-35 lg:block"
      />
      <img
        src={`${ASSET}/decorative/star-sparkle-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-[32%] left-[42%] hidden w-8 opacity-50 lg:block"
      />
      <img
        src={`${ASSET}/decorative/curved-lines-dot.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-4 right-0 hidden w-[300px] opacity-20 lg:block"
      />

      <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-12 px-6 lg:flex-row lg:gap-16 lg:px-12">
        <div className="w-full shrink-0 text-center lg:w-[48%] lg:text-left">
          <h1
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(36px, 4.7vw, 64px)",
              fontWeight: 800,
              lineHeight: 1.18,
            }}
          >
            <span>就活の不安を、</span>
            <br />
            <span style={{ color: "var(--lp-cta)" }}>AIで一つずつ</span>
            <span>解決。</span>
          </h1>

          <p
            className="mx-auto mt-5 max-w-xl lg:mx-0"
            style={{
              fontSize: 16,
              color: "var(--lp-muted-text)",
              lineHeight: 1.8,
            }}
          >
            ES添削・志望動機作成・面接対策・締切管理まで。
            <br />
            就活に必要なすべてを、就活Passでひとつに。
          </p>

          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: "var(--lp-cta)",
                fontWeight: 700,
                outlineColor: "rgba(37, 99, 235, 0.50)",
              }}
            >
              無料で始める
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 bg-white px-8 py-3.5 text-base transition-colors hover:bg-[#eef4ff] focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                borderColor: "var(--lp-cta)",
                color: "var(--lp-cta)",
                fontWeight: 700,
                outlineColor: "rgba(37, 99, 235, 0.50)",
              }}
            >
              機能を見る
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-3 lg:justify-start">
            {trustBadges.map((badge) => (
              <span
                key={badge.text}
                className="inline-flex items-center gap-2 text-sm"
                style={{ color: "var(--lp-muted-text)" }}
              >
                <img
                  src={badge.icon}
                  alt={badge.alt}
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                {badge.text}
              </span>
            ))}
          </div>
        </div>

        <div className="relative w-full max-w-[660px] lg:w-[52%] lg:max-w-none">
          <div className="relative mx-auto aspect-[1.36/1] w-full">
            <Image
              src={`${ASSET}/mockups/laptop-dashboard.png`}
              alt="就活Passのダッシュボード画面"
              width={1448}
              height={1086}
              className="h-auto w-[92%] rounded-xl"
              sizes="(max-width: 1024px) 92vw, 650px"
              preload
              style={{
                filter: "drop-shadow(0 24px 46px rgba(10, 15, 92, 0.18))",
              }}
            />
            <Image
              src={`${ASSET}/mockups/iphone-app.png`}
              alt="就活Passのスマートフォン画面"
              width={1086}
              height={1448}
              className="absolute bottom-0 right-0 h-auto w-[28%] max-w-[180px] drop-shadow-xl"
              sizes="(max-width: 1024px) 26vw, 180px"
              preload
            />
          </div>
        </div>
      </div>
    </section>
  );
}
