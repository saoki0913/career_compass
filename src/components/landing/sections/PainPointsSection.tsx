import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";

const ASSET = LP_ASSET_BASE;

const painCards = [
  {
    character: `${ASSET}/characters/boy-writing.png`,
    characterAlt: "ESを書く手が止まっている男子学生",
    icon: `${ASSET}/icons-line/doc-scattered.png`,
    iconAlt: "書類が散らばるアイコン",
    title: "ESがうまく書けない",
    desc: "何を書けばいいか分からず、手が止まってしまう。",
  },
  {
    character: `${ASSET}/characters/girl-at-laptop.png`,
    characterAlt: "締切管理に悩む女子学生",
    icon: `${ASSET}/icons-line/calendar.png`,
    iconAlt: "カレンダーアイコン",
    title: "締切や選考の管理が大変",
    desc: "企業ごとの予定がバラバラで、抜け漏れが不安。",
  },
  {
    character: `${ASSET}/characters/boy-thinking-hoodie.png`,
    characterAlt: "面接前に考え込む男子学生",
    icon: `${ASSET}/icons-line/people-chat.png`,
    iconAlt: "面接アイコン",
    title: "面接に自信が持てない",
    desc: "何を聞かれるか分からず、本番でうまく話せるか不安。",
  },
  {
    character: `${ASSET}/characters/girl-phone-thinking.png`,
    characterAlt: "スマートフォンで情報を探す女子学生",
    icon: `${ASSET}/icons-line/folder-search.png`,
    iconAlt: "フォルダ検索アイコン",
    title: "情報収集に時間がかかる",
    desc: "企業情報や応募状況を整理できず、就活が非効率になりやすい。",
  },
] as const;

export function PainPointsSection() {
  return (
    <section
      className="relative min-h-[920px] overflow-hidden bg-white py-16 2xl:py-[72px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={`${ASSET}/decorative/dot-pattern-light.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-6 top-10 hidden w-[150px] opacity-45 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/slash-marks.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[11%] top-[58px] hidden w-[92px] opacity-75 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/arc-star.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-0 top-[92px] hidden w-[360px] opacity-30 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/wave-line-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 right-0 hidden w-[720px] opacity-35 2xl:block"
      />

      <div className="relative z-10 mx-auto max-w-[1530px] px-5 sm:px-8 2xl:px-0">
        <div className="mb-[58px] text-center">
          <h2
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(40px, 5.2vw, 74px)",
              fontWeight: 800,
              letterSpacing: "0",
              lineHeight: 1.14,
            }}
          >
            {"こんな"}
            <span style={{ color: "var(--lp-cta)" }}>{"悩み"}</span>
            {"、ありませんか？"}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 2xl:grid-cols-4">
          {painCards.map((card) => (
            <article
              key={card.title}
              className="relative isolate flex min-h-[565px] flex-col overflow-hidden rounded-[22px] border bg-white px-7 pb-8 pt-8 text-center"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow:
                  "0 22px 44px rgba(0, 34, 104, 0.08), 0 2px 10px rgba(0, 34, 104, 0.04)",
              }}
            >
              <div className="absolute inset-x-10 top-[116px] z-0 h-[210px] rounded-[50%] bg-[var(--lp-tint-cta-soft)] opacity-90" />
              <div
                className="absolute left-8 top-8 z-20 flex h-[108px] w-[108px] items-center justify-center rounded-full bg-white"
                style={{ boxShadow: "0 18px 34px rgba(0, 102, 255, 0.13)" }}
              >
                <img
                  src={card.icon}
                  alt={card.iconAlt}
                  width={52}
                  height={52}
                  className="h-[52px] w-[52px] object-contain"
                />
              </div>

              <div className="relative z-10 mx-auto h-[300px] w-full">
                <img
                  src={card.character}
                  alt={card.characterAlt}
                  width={330}
                  height={330}
                  loading="eager"
                  decoding="sync"
                  className="mx-auto h-[300px] w-full object-contain object-bottom"
                />
              </div>

              <h3
                className="mt-7 text-[28px] leading-tight 2xl:text-[30px]"
                style={{ fontWeight: 800, color: "var(--lp-cta)" }}
              >
                {card.title}
              </h3>
              <div className="mx-auto mt-5 h-[5px] w-11 rounded-full bg-[var(--lp-cta)]" />
              <p
                className="mx-auto mt-6 max-w-[270px] text-[19px] leading-[1.8]"
                style={{ color: "var(--lp-muted-text)" }}
              >
                {card.desc}
              </p>
            </article>
          ))}
        </div>

        <p
          className="mt-[58px] text-center text-[24px] leading-relaxed 2xl:text-[32px]"
          style={{
            fontWeight: 800,
            color: "var(--lp-navy)",
          }}
        >
          <span style={{ color: "var(--lp-cta)" }}>就活Pass</span>
          {"なら、悩みをひとつずつ整理して"}
          <span style={{ color: "var(--lp-cta)" }}>前に進めます</span>
          {"。"}
        </p>
      </div>
    </section>
  );
}
