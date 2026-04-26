const ASSET = "/marketing/LP/assets";

const beforeItems = [
  { icon: "icons-line/doc-scattered.png", text: "やることが多くて、何から手をつければいいか分からない" },
  { icon: "icons-line/clock.png", text: "ES作成・面接対策・締切管理がバラバラ" },
  { icon: "icons-line/worried-face.png", text: "情報収集や企業管理に時間がかかる" },
  { icon: "icons-line/worried-face.png", text: "面接前に不安が残り、自信が持ちづらい" },
];

const afterItems = [
  "AIが添削してくれるから、ES・志望動機がひとつずつ仕上がる",
  "面接の練習から改善まで、AIが伴走",
  "締切・選考を確認しながら一元管理。見落としを減らせる",
  "企業情報も自動で整理",
];

export function BeforeAfterSection() {
  return (
    <section
      className="relative overflow-hidden py-20 lg:py-28"
      style={{ background: "#ffffff" }}
    >
      {/* Decorative elements -- hidden on mobile */}
      <img
        src={`${ASSET}/decorative/dot-pattern-2.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute top-8 right-0 hidden w-[140px] lg:block"
        style={{ opacity: 0.1 }}
      />
      <img
        src={`${ASSET}/decorative/arc-star.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-12 left-4 hidden w-[90px] lg:block"
        style={{ opacity: 0.1 }}
      />

      <div className="relative mx-auto max-w-[1200px] px-6">
        {/* ---- Heading ---- */}
        <h2
          className="mb-14 text-center"
          style={{
            fontSize: "clamp(28px, 3.5vw, 42px)",
            fontWeight: 800,
            color: "var(--lp-navy)",
            lineHeight: 1.2,
          }}
        >
          就活Passで、ここまで変わる。
        </h2>

        {/* ---- Two-column grid ---- */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* ======== Before card ======== */}
          <div
            className="relative rounded-2xl p-8"
            style={{ background: "#f5f5f5" }}
          >
            {/* Badge */}
            <span
              className="inline-block rounded-full px-5 py-1.5 text-sm text-white"
              style={{ fontWeight: 700, background: "#94a3b8" }}
            >
              Before
            </span>

            {/* Character */}
            <img
              src={`${ASSET}/characters/boy-stressed.png`}
              alt="悩む学生"
              className="mx-auto mt-6 h-auto w-[180px] lg:w-[200px]"
            />

            {/* Pain list */}
            <ul className="mt-6 space-y-3">
              {beforeItems.map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <img
                    src={`${ASSET}/${item.icon}`}
                    alt=""
                    className="mt-0.5 h-5 w-5"
                    style={{ opacity: 0.6 }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "var(--lp-muted-text)", lineHeight: 1.6 }}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* ======== After card ======== */}
          <div
            className="relative rounded-2xl p-8"
            style={{ background: "#eef4ff" }}
          >
            {/* Badge */}
            <span
              className="inline-block rounded-full px-5 py-1.5 text-sm text-white"
              style={{ fontWeight: 700, background: "var(--lp-cta)" }}
            >
              After
            </span>

            {/* Character */}
            <img
              src={`${ASSET}/characters/boy-confident.png`}
              alt="自信を持つ学生"
              className="mx-auto mt-6 h-auto w-[180px] lg:w-[200px]"
            />

            {/* Success list */}
            <ul className="mt-6 space-y-3">
              {afterItems.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <img
                    src={`${ASSET}/icons-line/checkmark.png`}
                    alt=""
                    className="mt-0.5 h-5 w-5"
                  />
                  <span
                    className="text-sm"
                    style={{
                      color: "#1e40af",
                      fontWeight: 500,
                      lineHeight: 1.6,
                    }}
                  >
                    {text}
                  </span>
                </li>
              ))}
            </ul>

            {/* Device mockups */}
            <div className="mt-6 flex items-end justify-center gap-4">
              <img
                src={`${ASSET}/mockups/laptop-dashboard-v2.png`}
                alt="就活Pass ダッシュボード"
                className="h-auto w-[240px] rounded-lg lg:w-[300px]"
                style={{
                  boxShadow:
                    "0 4px 14px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
                }}
              />
              <img
                src={`${ASSET}/mockups/iphone-v2.png`}
                alt="就活Pass モバイル"
                className="h-auto w-[70px] lg:w-[90px]"
              />
            </div>
          </div>
        </div>

        {/* ---- Bottom line ---- */}
        <p
          className="mt-14 text-center text-lg"
          style={{
            fontWeight: 600,
            color: "var(--lp-muted-text)",
            lineHeight: 1.6,
          }}
        >
          就活の準備を、迷わず・着実に進めるためのオールインワン。
        </p>
      </div>
    </section>
  );
}
