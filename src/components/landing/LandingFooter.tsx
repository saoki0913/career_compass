import Link from "next/link";
import { lpAsset } from "@/lib/marketing/lp-assets";

const FOOTER_COLUMNS = [
  {
    title: "サービス",
    links: [
      { label: "機能一覧", href: "/#features" },
      { label: "料金プラン", href: "/pricing" },
    ],
  },
  {
    title: "サポート",
    links: [
      { label: "よくある質問", href: "/#faq" },
      { label: "お問い合わせ", href: "/contact" },
    ],
  },
  {
    title: "規約",
    links: [
      { label: "利用規約", href: "/terms" },
      { label: "プライバシーポリシー", href: "/privacy" },
      { label: "特定商取引法に基づく表記", href: "/legal" },
    ],
  },
  {
    title: "公開ページ",
    links: [
      { label: "無料ツール", href: "/tools" },
      { label: "テンプレ集", href: "/templates" },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer
      className="relative min-h-[380px] overflow-hidden"
      style={{
        background: "var(--lp-footer-bg)",
        fontFamily: "'Inter', 'Noto Sans JP', sans-serif",
      }}
    >
      <img
        src={lpAsset("branding/cityscape.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 w-full select-none object-cover object-bottom opacity-[0.16]"
        style={{ maxHeight: "260px" }}
      />

      <img
        src={lpAsset("decorative/star-sparkle-1.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-8 top-8 hidden select-none opacity-38 md:block"
        style={{ width: "32px", height: "32px" }}
      />

      <img
        src={lpAsset("decorative/wave-corner.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute left-0 top-0 hidden select-none opacity-25 md:block"
        style={{ width: "150px" }}
      />

      <div className="relative z-10 mx-auto max-w-[1600px] px-5 pb-6 pt-[74px] sm:px-8 2xl:px-0">
        <div className="grid gap-10 2xl:grid-cols-[360px_1fr_330px]">
          <div>
            <div className="mb-7 flex items-center gap-4">
              <img
                src={lpAsset("branding/compass-icon-navy.png")}
                alt="就活Pass"
                style={{ width: "58px", height: "58px" }}
              />
              <span
                className="text-[40px] leading-none"
                style={{
                  fontWeight: 800,
                  color: "var(--lp-navy)",
                }}
              >
                就活Pass
              </span>
            </div>
            <p
              className="text-[18px]"
              style={{
                lineHeight: 1.8,
                color: "var(--lp-muted-text)",
              }}
            >
              AIが就活を通して、就活生の可能性を最大化し、
              <br />
              納得のいくキャリア形成をサポートします。
            </p>
          </div>

          <nav
            aria-label="フッターナビゲーション"
            className="grid grid-cols-2 gap-x-10 gap-y-8 text-[20px] sm:grid-cols-4 md:gap-x-14"
          >
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-5">
                <span
                  className="text-[22px]"
                  style={{
                    fontWeight: 800,
                    color: "var(--lp-navy)",
                    borderBottom: "3px solid var(--lp-cta)",
                    paddingBottom: "8px",
                    display: "inline-block",
                  }}
                >
                  {col.title}
                </span>
                {col.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="footer-nav-link transition-colors"
                    style={{
                      color: "var(--lp-navy)",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div aria-hidden="true" className="hidden 2xl:block" />
        </div>

        <div
          className="mt-16 pt-7 text-center"
          style={{ borderTop: "1px solid var(--lp-border-hairline)" }}
        >
          <p className="text-sm" style={{ color: "var(--lp-muted-text)" }}>
            &copy; 2026 就活Pass . All rights reserved.
          </p>
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-0 right-[1.5%] hidden select-none 2xl:flex"
        style={{ opacity: 0.94 }}
      >
        <img
          src={lpAsset("shukatsu_pass_transparent_assets/08_male_character.png")}
          alt=""
          role="presentation"
          className="relative z-0 -mr-8 object-contain"
          style={{ height: "330px" }}
        />
        <img
          src={lpAsset("shukatsu_pass_transparent_assets/09_female_character.png")}
          alt=""
          role="presentation"
          className="relative z-10 object-contain"
          style={{ height: "330px" }}
        />
      </div>
    </footer>
  );
}
