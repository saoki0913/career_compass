import { lpAsset } from "@/lib/marketing/lp-assets";

const SHUPASS_ASSET = "shupass-v2";

const painCards = [
  {
    character: "characters/boy-writing.png",
    characterAlt: "ESを書く手が止まっている男子学生",
    icon: "icons-line/doc-scattered.png",
    iconAlt: "書類が散らばるアイコン",
    title: "ESがうまく書けない",
    desc: "何を書けばいいか分からず、手が止まってしまう。",
  },
  {
    character: "characters/girl-at-laptop.png",
    characterAlt: "締切管理に悩む女子学生",
    icon: "icons-line/calendar.png",
    iconAlt: "カレンダーアイコン",
    title: "締切や選考の管理が大変",
    desc: "企業ごとの予定がバラバラで、抜け漏れが不安。",
  },
  {
    character: "characters/boy-thinking-hoodie.png",
    characterAlt: "面接前に考え込む男子学生",
    icon: "icons-line/people-chat.png",
    iconAlt: "面接アイコン",
    title: "面接に自信が持てない",
    desc: "何を聞かれるか分からず、本番でうまく話せるか不安。",
  },
  {
    character: "characters/girl-phone-thinking.png",
    characterAlt: "スマートフォンで情報を探す女子学生",
    icon: "icons-line/folder-search.png",
    iconAlt: "フォルダ検索アイコン",
    title: "情報収集に時間がかかる",
    desc: "企業情報や応募状況を整理できず、就活が非効率になりやすい。",
  },
] as const;

export function PainPointsSection() {
  return (
    <section
      id="worries"
      className="relative overflow-hidden bg-white py-16 sm:py-20 lg:min-h-[720px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={lpAsset(`${SHUPASS_ASSET}/worry-deco-dots.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-0 top-8 hidden w-[170px] opacity-75 lg:block"
      />
      <img
        src={lpAsset(`${SHUPASS_ASSET}/worry-deco-swirl.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[17%] top-[82px] hidden w-[78px] opacity-90 lg:block"
      />
      <img
        src={lpAsset(`${SHUPASS_ASSET}/worry-deco-bar.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[16%] top-[92px] hidden w-[86px] opacity-90 lg:block"
      />
      <img
        src={lpAsset(`${SHUPASS_ASSET}/worry-deco-star.png`)}
        alt=""
        role="presentation"
        className="pointer-events-none absolute right-[10%] top-[132px] hidden w-[56px] opacity-90 lg:block"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="mb-11 text-center">
          <h2
            className="text-[36px] leading-[1.18] sm:text-[44px] lg:text-[48px]"
            style={{
              color: "var(--lp-navy)",
              fontWeight: 800,
              letterSpacing: "0",
            }}
          >
            こんな<span style={{ color: "var(--lp-cta)" }}>悩み</span>、ありませんか？
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {painCards.map((card) => (
            <article
              key={card.title}
              className="relative isolate flex min-h-[418px] flex-col overflow-hidden rounded-[20px] border bg-white px-5 pb-6 pt-5 text-center"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow: "0 16px 32px rgba(20, 50, 110, 0.08)",
              }}
            >
              <div className="absolute inset-x-8 top-[96px] z-0 h-[142px] rounded-[50%] bg-[var(--lp-tint-cta-soft)]" />
              <div
                className="absolute left-5 top-5 z-20 flex h-[76px] w-[76px] items-center justify-center rounded-2xl bg-white"
                style={{ boxShadow: "0 14px 28px rgba(37, 99, 235, 0.12)" }}
              >
                <img
                  src={lpAsset(card.icon)}
                  alt={card.iconAlt}
                  className="h-[38px] w-[38px] object-contain"
                />
              </div>

              <div className="relative z-10 mx-auto h-[210px] w-full">
                <img
                  src={lpAsset(card.character)}
                  alt={card.characterAlt}
                  loading="lazy"
                  decoding="async"
                  className="mx-auto h-[210px] w-full origin-bottom scale-125 object-contain object-bottom lg:scale-100"
                />
              </div>

              <h3
                className="mt-4 text-[21px] leading-tight"
                style={{ fontWeight: 800, color: "var(--lp-cta)" }}
              >
                {card.title}
              </h3>
              <div className="mx-auto mt-4 h-[4px] w-9 rounded-full bg-[var(--lp-cta)]" />
              <p
                className="mx-auto mt-4 max-w-[230px] text-[14px] leading-[1.7]"
                style={{ color: "var(--lp-muted-text)" }}
              >
                {card.desc}
              </p>
            </article>
          ))}
        </div>

        <div className="relative mt-11 text-center">
          <p
            className="text-[22px] leading-relaxed sm:text-[26px]"
            style={{ fontWeight: 800, color: "var(--lp-navy)" }}
          >
            <span style={{ color: "var(--lp-cta)" }}>就活Pass</span>
            なら、悩みをひとつずつ整理して
            <span style={{ color: "var(--lp-cta)" }}>前に進めます。</span>
          </p>
          <svg
            className="mx-auto mt-7 hidden h-[30px] w-full max-w-[1000px] sm:block"
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
      </div>
    </section>
  );
}
