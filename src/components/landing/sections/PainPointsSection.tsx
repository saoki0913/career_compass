const ASSET = "/marketing/LP/assets";

const painCards = [
  {
    character: `${ASSET}/characters/girl-at-laptop.png`,
    characterAlt: "ESを書いている女子学生",
    icon: `${ASSET}/icons-line/doc-scattered.png`,
    iconAlt: "書類が散らばるアイコン",
    title: "ESがうまく書けない",
    desc: "何を書けばいいか分からない。書いても手応えがない。",
  },
  {
    character: `${ASSET}/characters/boy-thinking-hoodie.png`,
    characterAlt: "パーカーを着て考える男子学生",
    icon: `${ASSET}/icons-line/clock.png`,
    iconAlt: "時計アイコン",
    title: "締切や選考の管理が大変",
    desc: "企業ごとの予定がバラバラ。気付けば締切が過ぎていた。",
  },
  {
    character: `${ASSET}/characters/girl-clasped-standing.png`,
    characterAlt: "手を握って立つ女子学生",
    icon: `${ASSET}/icons-line/worried-face.png`,
    iconAlt: "不安な表情のアイコン",
    title: "面接に自信が持てない",
    desc: "何を聞かれるか不安。練習する相手もいない。",
  },
  {
    character: `${ASSET}/characters/boy-glasses-standing.png`,
    characterAlt: "眼鏡をかけて立つ男子学生",
    icon: `${ASSET}/icons-line/folder-search.png`,
    iconAlt: "フォルダ検索アイコン",
    title: "情報収集に時間がかかる",
    desc: "企業情報や選考情報の整理に時間が取られる。",
  },
] as const;

export function PainPointsSection() {
  return (
    <section
      className="relative overflow-hidden bg-white py-20 lg:py-28"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      {/* ---------- decorative (desktop only) ---------- */}
      <img
        src={`${ASSET}/decorative/blue-circle-lg.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-1/2 top-1/2 hidden w-[500px] -translate-x-1/2 -translate-y-1/2 opacity-10 lg:block"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-6">
        {/* ---------- heading ---------- */}
        <div className="mb-14 text-center">
          <h2
            style={{
              color: "var(--lp-navy)",
              fontSize: "clamp(28px, 3.5vw, 42px)",
              fontWeight: 800,
              lineHeight: 1.25,
            }}
          >
            {"こんな"}
            <span style={{ color: "var(--lp-cta)" }}>{"悩み"}</span>
            {"、ありませんか？"}
          </h2>
        </div>

        {/* ---------- 4 pain items (no card wrappers) ---------- */}
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-10">
          {painCards.map((card) => (
            <div key={card.title} className="text-center">
              {/* character illustration with floating icon */}
              <div className="relative mx-auto w-[180px] lg:w-[200px]">
                <img
                  src={card.character}
                  alt={card.characterAlt}
                  width={200}
                  height={220}
                  className="mx-auto h-[200px] w-[180px] object-contain lg:h-[220px] lg:w-[200px]"
                />
                {/* floating icon near character top-right */}
                <img
                  src={card.icon}
                  alt={card.iconAlt}
                  width={28}
                  height={28}
                  className="absolute -right-2 top-2 h-7 w-7 opacity-50"
                />
              </div>

              {/* title */}
              <h3
                className="mt-4 text-[17px]"
                style={{ fontWeight: 700, color: "var(--lp-navy)" }}
              >
                {card.title}
              </h3>

              {/* description */}
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--lp-muted-text)" }}
              >
                {card.desc}
              </p>
            </div>
          ))}
        </div>

        {/* ---------- bottom line ---------- */}
        <p
          className="mt-14 text-center text-lg"
          style={{
            fontWeight: 600,
            color: "var(--lp-muted-text)",
          }}
        >
          {"就活Passなら、悩みをひとつずつ整理して前に進めます。"}
        </p>
      </div>
    </section>
  );
}
