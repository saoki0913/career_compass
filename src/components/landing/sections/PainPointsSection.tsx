import { lpSectionAsset } from "@/lib/marketing/lp-assets";

const WORRIES = [
  {
    img: "worries/card-es-writing.png",
    alt: "ESがうまく書けない",
    srText:
      "ESがうまく書けない — 何を書けばいいか分からず、手が止まってしまう。",
  },
  {
    img: "worries/card-deadline-management.png",
    alt: "締切や選考の管理が大変",
    srText:
      "締切や選考の管理が大変 — 企業ごとの予定がバラバラで、抜け漏れが不安。",
  },
  {
    img: "worries/card-interview-anxiety.png",
    alt: "面接に自信が持てない",
    srText:
      "面接に自信が持てない — 何を聞かれるか分からず、本番でうまく話せるか不安。",
  },
  {
    img: "worries/card-info-collection.png",
    alt: "情報収集に時間がかかる",
    srText:
      "情報収集に時間がかかる — 企業情報や応募状況を整理できず、就活が非効率になりやすい。",
  },
] as const;

export function PainPointsSection() {
  return (
    <section
      id="worries"
      className="relative overflow-hidden"
      style={{
        background: "#f5f9ff",
        padding: "90px 0 100px",
        fontFamily:
          "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        fontFeatureSettings: '"palt"',
      }}
    >
      {/* Decorative dots — left side */}
      <img
        src={lpSectionAsset("worries/decoration-dots-circle.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute hidden lg:block"
        style={{
          top: 30,
          left: -60,
          width: 320,
          opacity: 0.85,
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
        {/* Heading with decorative images */}
        <div className="relative mb-11 text-center">
          {/* Deco — swirl (left of title) */}
          <img
            src={lpSectionAsset("worries/decoration-swirl.png")}
            alt=""
            role="presentation"
            className="pointer-events-none absolute hidden lg:block"
            style={{
              width: 90,
              left: "calc(50% - 320px)",
              top: "50%",
              transform: "translateY(-50%) rotate(-8deg)",
            }}
          />
          {/* Deco — bar (right of title) */}
          <img
            src={lpSectionAsset("worries/decoration-bar-chart.png")}
            alt=""
            role="presentation"
            className="pointer-events-none absolute hidden lg:block"
            style={{
              width: 64,
              right: "calc(50% - 290px)",
              top: "50%",
              transform: "translateY(-30%)",
            }}
          />
          {/* Deco — star (further right of title) */}
          <img
            src={lpSectionAsset("worries/decoration-star.png")}
            alt=""
            role="presentation"
            className="pointer-events-none absolute hidden lg:block"
            style={{
              width: 70,
              right: "calc(50% - 360px)",
              top: "50%",
              transform: "translateY(-90%) rotate(8deg)",
            }}
          />

          <h2
            style={{
              fontSize: 44,
              fontWeight: 900,
              color: "#0f1f3d",
              letterSpacing: "0.01em",
              lineHeight: 1.3,
            }}
          >
            こんな
            <span style={{ color: "var(--lp-cta)" }}>悩み</span>
            、ありませんか？
          </h2>
        </div>

        {/* 4-column worry card grid */}
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 22 }}
        >
          {WORRIES.map((card) => (
            <article
              key={card.alt}
              className="worry-card overflow-hidden"
              style={{
                background: "#fff",
                borderRadius: 22,
                boxShadow: "0 6px 22px rgba(20,50,110,0.06)",
                border: "1px solid #eaf0fa",
                transition: "transform 280ms, box-shadow 280ms",
              }}
            >
              <img
                src={lpSectionAsset(card.img)}
                alt={card.alt}
                loading="lazy"
                decoding="async"
                className="block w-full"
              />
              <span className="sr-only">{card.srText}</span>
            </article>
          ))}
        </div>

        {/* Footer message */}
        <div
          className="flex items-center justify-center"
          style={{ marginTop: 64, gap: 14 }}
        >
          {/* Left sparkle */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 30 30"
            fill="none"
            aria-hidden="true"
          >
            <line
              x1="6"
              y1="6"
              x2="13"
              y2="13"
              stroke="#6aa9ff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="22"
              y1="8"
              x2="16"
              y2="13"
              stroke="#6aa9ff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="14"
              y1="22"
              x2="14"
              y2="16"
              stroke="#6aa9ff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>

          <p
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#0f1f3d",
            }}
          >
            <span style={{ color: "var(--lp-cta)", fontWeight: 900 }}>
              就活Pass
            </span>
            なら、悩みをひとつずつ整理して
            <span style={{ color: "var(--lp-cta)", fontWeight: 900 }}>
              前に進めます。
            </span>
          </p>

          {/* Right sparkle */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 30 30"
            fill="none"
            aria-hidden="true"
          >
            <line
              x1="24"
              y1="6"
              x2="17"
              y2="13"
              stroke="#6aa9ff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="8"
              y1="8"
              x2="14"
              y2="13"
              stroke="#6aa9ff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <line
              x1="16"
              y1="22"
              x2="16"
              y2="16"
              stroke="#6aa9ff"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Decorative wavy line */}
        <svg
          className="mx-auto"
          style={{ maxWidth: 1100, height: 30, marginTop: 14, opacity: 0.7 }}
          viewBox="0 0 1200 30"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 18 Q200 2 400 18 T800 18 T1200 18"
            stroke="#bcd4ff"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="800" cy="18" r="4" fill="#6aa9ff" />
        </svg>
      </div>

      {/* Responsive: 2-column grid at <=900px, single column on mobile */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .worry-card:hover {
              transform: translateY(-6px);
              box-shadow: 0 16px 36px rgba(20,50,110,0.12) !important;
            }
            @media (max-width: 900px) {
              #worries .grid {
                grid-template-columns: repeat(2, 1fr) !important;
              }
            }
            @media (max-width: 540px) {
              #worries .grid {
                grid-template-columns: 1fr !important;
              }
              #worries {
                padding: 60px 0 70px !important;
              }
              #worries h2 {
                font-size: 32px !important;
              }
            }
          `,
        }}
      />
    </section>
  );
}
