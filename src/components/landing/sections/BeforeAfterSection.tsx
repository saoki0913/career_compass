import { LP_ASSET_BASE } from "@/lib/marketing/lp-assets";

const ASSET = LP_ASSET_BASE;

const beforeItems = [
  {
    icon: "icons-line/worried-face.png",
    text: "やることが多くて、何から手をつければいいか分からない",
  },
  {
    icon: "icons-line/doc-scattered.png",
    text: "ES作成・面接対策・締切管理がバラバラ",
  },
  {
    icon: "icons-line/clock.png",
    text: "情報収集や企業管理に時間がかかる",
  },
  {
    icon: "icons-line/worried-face.png",
    text: "面接前に不安が残り、自信が持ちづらい",
  },
] as const;

const afterItems = [
  {
    icon: "icons-line/checkmark.png",
    text: "AIが次にやることを整理してくれる",
  },
  {
    icon: "icons-line/doc-check.png",
    text: "ES・面接・締切をひとつにまとめて管理できる",
  },
  {
    icon: "icons-line/bar-chart.png",
    text: "企業情報や進捗が見やすくなり、効率的に進められる",
  },
  {
    icon: "icons-line/worried-face.png",
    text: "練習と準備が整い、自信を持って本番に向かえる",
  },
] as const;

export function BeforeAfterSection() {
  return (
    <section
      className="relative min-h-[940px] overflow-hidden bg-white py-[72px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={`${ASSET}/decorative/sparkle-lines.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-[49%] top-[42%] hidden w-[72px] opacity-55 2xl:block"
      />
      <img
        src={`${ASSET}/decorative/wave-line-1.png`}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-38 2xl:block"
      />

      <div className="relative mx-auto max-w-[1600px] px-5 sm:px-8 2xl:px-0">
        <h2
          className="mb-[58px] text-center"
          style={{
            color: "var(--lp-navy)",
            fontSize: "clamp(40px, 5vw, 66px)",
            fontWeight: 800,
            letterSpacing: "0",
            lineHeight: 1.16,
          }}
        >
          {"就活Passで、"}
          <span style={{ color: "var(--lp-cta)" }}>ここまで変わる。</span>
        </h2>

        <div className="mx-auto grid max-w-[1512px] items-stretch gap-8 xl:grid-cols-2 2xl:grid-cols-[668px_120px_724px] 2xl:gap-0">
          <div
            className="relative min-h-[600px] overflow-hidden rounded-[22px] border bg-[#f7f7f7] p-9"
            style={{ borderColor: "var(--lp-border-default)" }}
          >
            <span
              className="inline-flex rounded-full px-8 py-3 text-[24px] leading-none text-white"
              style={{ fontWeight: 800, background: "#8b8b8b" }}
            >
              Before
            </span>

            <img
              src={`${ASSET}/characters/boy-stressed.png`}
              alt="やることが多くて悩む学生"
              className="mx-auto mt-8 h-auto w-[220px] object-contain sm:w-[280px] 2xl:absolute 2xl:bottom-0 2xl:left-0 2xl:mt-0 2xl:w-[360px]"
            />

            <ul className="relative z-10 mt-5 w-full rounded-[20px] bg-white/82 p-3 backdrop-blur-sm 2xl:absolute 2xl:right-8 2xl:top-[86px] 2xl:mt-0 2xl:w-[360px]">
              {beforeItems.map((item) => (
                <li
                  key={item.text}
                  className="flex min-h-[92px] items-center gap-4 border-b py-4 last:border-b-0 2xl:min-h-[116px] 2xl:gap-6"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white 2xl:h-[58px] 2xl:w-[58px]">
                    <img
                      src={`${ASSET}/${item.icon}`}
                      alt=""
                      role="presentation"
                      className="h-8 w-8 object-contain opacity-60 grayscale"
                    />
                  </span>
                  <span
                    className="text-[16px] font-bold leading-[1.5] 2xl:text-[21px]"
                    style={{ color: "var(--lp-muted-text)" }}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative hidden items-center justify-center 2xl:flex" aria-hidden="true">
            <div
              className="h-0 w-0 border-y-[82px] border-l-[120px] border-y-transparent border-l-[var(--lp-cta)]"
              style={{
                filter: "drop-shadow(-54px 0 22px rgba(37, 99, 235, 0.24))",
              }}
            />
          </div>

          <div
            className="relative min-h-[600px] overflow-hidden rounded-[22px] border p-9"
            style={{
              background: "linear-gradient(135deg, #eef6ff 0%, #ffffff 56%)",
              borderColor: "rgba(37, 99, 235, 0.32)",
            }}
          >
            <span
              className="inline-flex rounded-full px-8 py-3 text-[24px] leading-none text-white 2xl:ml-16"
              style={{ fontWeight: 800, background: "var(--lp-cta)" }}
            >
              After
            </span>

            <img
              src={`${ASSET}/characters/boy-confident.png`}
              alt="自信を持って準備を進める学生"
              className="mx-auto mt-8 h-auto w-[210px] object-contain 2xl:absolute 2xl:bottom-[126px] 2xl:left-[66px] 2xl:z-10 2xl:mt-0 2xl:w-[285px]"
            />
            <p
              className="mt-3 text-center text-[18px] 2xl:absolute 2xl:left-[250px] 2xl:top-[130px] 2xl:z-20 2xl:mt-0 2xl:-rotate-12 2xl:text-[21px]"
              style={{ color: "var(--lp-cta)", fontWeight: 800 }}
            >
              もう迷わない!
            </p>

            <div className="mt-5 flex items-end justify-center gap-2 2xl:absolute 2xl:bottom-[46px] 2xl:left-[146px] 2xl:z-20 2xl:mt-0">
              <img
                src={`${ASSET}/mockups/laptop-dashboard-v2.png`}
                alt="就活Pass ダッシュボード"
                className="h-auto w-[295px] rounded-lg"
                style={{
                  boxShadow:
                    "0 8px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
                }}
              />
              <img
                src={`${ASSET}/mockups/iphone-v2.png`}
                alt="就活Pass モバイル"
                className="h-auto w-[86px]"
              />
            </div>

            <ul className="relative z-30 mt-5 w-full rounded-[20px] bg-white/95 p-3 backdrop-blur-sm 2xl:absolute 2xl:right-7 2xl:top-[86px] 2xl:mt-0 2xl:w-[330px]">
              {afterItems.map((item) => (
                <li
                  key={item.text}
                  className="flex min-h-[92px] items-center gap-4 border-b py-4 last:border-b-0 2xl:min-h-[116px] 2xl:gap-5"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white 2xl:h-[58px] 2xl:w-[58px]">
                    <img
                      src={`${ASSET}/${item.icon}`}
                      alt=""
                      role="presentation"
                      className="h-8 w-8 object-contain"
                    />
                  </span>
                  <span
                    className="text-[16px] font-extrabold leading-[1.45] 2xl:text-[21px]"
                    style={{ color: "var(--lp-cta)" }}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p
          className="mt-[58px] text-center text-[28px] leading-relaxed lg:text-[40px]"
          style={{
            fontWeight: 800,
            color: "var(--lp-navy)",
          }}
        >
          {"就活の準備を、"}
          <span style={{ color: "var(--lp-cta)" }}>迷わず・着実に進める</span>
          {"ためのオールインワン。"}
        </p>
      </div>
    </section>
  );
}
