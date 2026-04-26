import Link from "next/link";

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
      className="relative overflow-hidden"
      style={{ background: "var(--lp-footer-bg)" }}
    >
      {/* --- Cityscape silhouette background --- */}
      <img
        src="/marketing/LP/assets/branding/cityscape.png"
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 w-full select-none object-cover object-bottom opacity-[0.10]"
        style={{ maxHeight: "220px" }}
      />

      {/* --- Decorative sparkle (top-left area) --- */}
      <img
        src="/marketing/LP/assets/decorative/star-sparkle-1.png"
        alt=""
        role="presentation"
        className="pointer-events-none absolute top-6 left-8 hidden select-none opacity-30 md:block"
        style={{ width: "28px", height: "28px" }}
      />

      {/* --- Wave corner decoration (top-left) --- */}
      <img
        src="/marketing/LP/assets/decorative/wave-corner.png"
        alt=""
        role="presentation"
        className="pointer-events-none absolute top-0 left-0 hidden select-none opacity-20 md:block"
        style={{ width: "120px" }}
      />

      {/* --- Main content --- */}
      <div className="relative z-10 mx-auto max-w-[1200px] px-6 pt-16 pb-6 lg:px-12">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row">
          {/* --- Brand block --- */}
          <div style={{ maxWidth: "320px" }}>
            <div className="mb-4 flex items-center gap-3">
              <img
                src="/marketing/LP/assets/branding/compass-icon-navy.png"
                alt="就活Pass"
                style={{ width: "36px", height: "36px" }}
              />
              <span
                className="text-xl"
                style={{
                  fontWeight: 700,
                  color: "var(--lp-navy)",
                  letterSpacing: "-0.01em",
                }}
              >
                就活Pass
              </span>
            </div>
            <p
              className="text-sm"
              style={{
                lineHeight: 1.75,
                color: "var(--lp-muted-text)",
              }}
            >
              AIが就活を通して、就活生の可能性を最大化し、
              <br className="hidden sm:inline" />
              納得のいくキャリア形成をサポートします。
            </p>
          </div>

          {/* --- Link columns --- */}
          <nav
            aria-label="フッターナビゲーション"
            className="grid grid-cols-2 gap-x-10 gap-y-8 text-sm sm:grid-cols-4 md:gap-x-14"
          >
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <span
                  className="text-xs tracking-wide"
                  style={{
                    fontWeight: 700,
                    color: "var(--lp-navy)",
                    borderBottom: "2px solid var(--lp-cta)",
                    paddingBottom: "6px",
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
                      textDecoration: "none",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* --- Copyright bar --- */}
        <div
          className="mt-14 pt-6 text-center"
          style={{ borderTop: "1px solid var(--lp-border-hairline)" }}
        >
          <p className="text-xs" style={{ color: "var(--lp-muted-text)" }}>
            &copy; 2026 就活Pass . All rights reserved.
          </p>
        </div>
      </div>

      {/* --- Character illustrations (right side, desktop only) --- */}
      <div
        className="pointer-events-none absolute bottom-0 right-[3%] hidden select-none lg:flex"
        style={{ opacity: 0.85 }}
      >
        {/* Male character -- positioned slightly behind */}
        <img
          src="/marketing/LP/assets/shukatsu_pass_transparent_assets/08_male_character.png"
          alt=""
          role="presentation"
          className="relative z-0 -mr-6 object-contain"
          style={{ height: "320px" }}
        />
        {/* Female character -- positioned in front */}
        <img
          src="/marketing/LP/assets/shukatsu_pass_transparent_assets/09_female_character.png"
          alt=""
          role="presentation"
          className="relative z-10 object-contain"
          style={{ height: "320px" }}
        />
      </div>
    </footer>
  );
}
