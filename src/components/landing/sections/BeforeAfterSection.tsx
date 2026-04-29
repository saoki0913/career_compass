import { lpAsset } from "@/lib/marketing/lp-assets";

const beforeItems = [
  "やることが多くて、何から手をつければいいか分からない",
  "ES作成・面接対策・締切管理がバラバラ",
  "情報収集や企業管理に時間がかかる",
  "面接前に不安が残り、自信が持ちづらい",
] as const;

const afterItems = [
  "AIが次にやることを整理してくれる",
  "ES・面接・締切をひとつにまとめて管理できる",
  "企業情報や進捗が見やすくなり、効率的に進められる",
  "練習と準備が整い、自信を持って本番に向かえる",
] as const;

function CheckIcon({ variant }: { variant: "before" | "after" }) {
  const color = variant === "after" ? "var(--lp-cta)" : "#3a3f47";

  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white"
      style={{ color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="h-8 w-8" fill="none">
        <circle cx="24" cy="24" r="13" stroke="currentColor" strokeWidth="1.8" />
        {variant === "after" ? (
          <path
            d="M18 24.5l4 4 8-9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M18 30c2-2 4-3 6-3s4 1 6 3M19 21h.1M29 21h.1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

export function BeforeAfterSection() {
  return (
    <section
      id="before-after"
      className="relative overflow-hidden bg-white py-16 sm:py-20 lg:min-h-[760px]"
      style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}
    >
      <img
        src={lpAsset("shupass-v2/ba/wave.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 hidden w-full opacity-65 lg:block"
      />

      <div className="relative z-10 mx-auto max-w-[1200px] px-5 sm:px-8">
        <h2
          className="mb-10 text-center text-[34px] leading-[1.2] sm:text-[44px] lg:text-[46px]"
          style={{
            color: "var(--lp-navy)",
            fontWeight: 800,
            letterSpacing: "0",
          }}
        >
          就活Passで、<span style={{ color: "var(--lp-cta)" }}>ここまで変わる。</span>
        </h2>

        <div className="relative mx-auto grid max-w-[1120px] items-stretch gap-6 lg:grid-cols-[1fr_88px_1fr] lg:gap-0">
          <div
            className="relative min-h-[500px] overflow-hidden rounded-[22px] border bg-[#f7f7f7] p-6"
            style={{ borderColor: "var(--lp-border-default)" }}
          >
            <span
              className="inline-flex rounded-full px-6 py-2 text-[20px] leading-none text-white"
              style={{ fontWeight: 800, background: "#8b8b8b" }}
            >
              Before
            </span>

            <img
              src={lpAsset("shupass-v2/ba/illust-worried.png")}
              alt="やることが多くて悩む学生"
              className="absolute bottom-0 left-0 hidden h-auto w-[275px] object-contain sm:block"
            />

            <ul className="relative z-10 mt-7 space-y-0 rounded-[18px] bg-white/88 p-3 backdrop-blur-sm sm:ml-auto sm:mt-4 sm:w-[295px]">
              {beforeItems.map((item) => (
                <li
                  key={item}
                  className="flex min-h-[88px] items-center gap-4 border-b py-3 last:border-b-0"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <CheckIcon variant="before" />
                  <span
                    className="text-[15px] font-bold leading-[1.55]"
                    style={{ color: "var(--lp-muted-text)" }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative hidden items-center justify-center lg:flex" aria-hidden="true">
            <img
              src={lpAsset("shupass-v2/ba/arrow.png")}
              alt=""
              role="presentation"
              className="relative z-20 w-[104px] max-w-none"
              style={{ filter: "drop-shadow(-24px 0 18px rgba(37, 99, 235, 0.18))" }}
            />
            <img
              src={lpAsset("shupass-v2/ba/mockup.png")}
              alt=""
              role="presentation"
              className="absolute bottom-6 left-1/2 z-10 w-[255px] max-w-none -translate-x-1/2"
              style={{ filter: "drop-shadow(0 16px 28px rgba(20, 50, 110, 0.14))" }}
            />
          </div>

          <div
            className="relative min-h-[500px] overflow-hidden rounded-[22px] border p-6"
            style={{
              background: "linear-gradient(135deg, #eef6ff 0%, #ffffff 58%)",
              borderColor: "rgba(37, 99, 235, 0.32)",
            }}
          >
            <span
              className="inline-flex rounded-full px-6 py-2 text-[20px] leading-none text-white"
              style={{ fontWeight: 800, background: "var(--lp-cta)" }}
            >
              After
            </span>

            <img
              src={lpAsset("shupass-v2/ba/illust-cheerful.png")}
              alt="自信を持って準備を進める学生"
              className="absolute bottom-0 left-0 hidden h-auto w-[275px] object-contain sm:block"
            />
            <p
              className="absolute left-[205px] top-[118px] hidden -rotate-12 text-[18px] sm:block"
              style={{ color: "var(--lp-cta)", fontWeight: 800 }}
            >
              もう迷わない!
            </p>

            <ul className="relative z-10 mt-7 space-y-0 rounded-[18px] bg-white/95 p-3 backdrop-blur-sm sm:ml-auto sm:mt-4 sm:w-[295px]">
              {afterItems.map((item) => (
                <li
                  key={item}
                  className="flex min-h-[88px] items-center gap-4 border-b py-3 last:border-b-0"
                  style={{ borderColor: "var(--lp-border-default)" }}
                >
                  <CheckIcon variant="after" />
                  <span
                    className="text-[15px] font-extrabold leading-[1.5]"
                    style={{ color: "var(--lp-cta)" }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p
          className="mt-10 text-center text-[23px] leading-relaxed sm:text-[30px]"
          style={{ fontWeight: 800, color: "var(--lp-navy)" }}
        >
          就活の準備を、
          <span style={{ color: "var(--lp-cta)" }}>迷わず・着実に進める</span>
          ためのオールインワン。
        </p>
      </div>
    </section>
  );
}
