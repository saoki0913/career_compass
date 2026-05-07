import Link from "next/link";
import { lpSectionAsset } from "@/lib/marketing/lp-assets";

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
      data-section="landing-footer"
      className="relative min-h-[390px] overflow-hidden"
      style={{
        background: "var(--lp-footer-bg)",
        fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <img
        src={lpSectionAsset("footer/cityscape.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-0 left-0 w-full select-none object-cover object-bottom"
        style={{ height: "190px", maxHeight: "none", objectPosition: "left bottom", opacity: 0.18 }}
      />


      <div className="footer-content relative z-10 mx-auto max-w-[1560px] px-6 pb-6 pt-14 sm:px-10 lg:px-12 xl:px-14">
        <div className="grid gap-12 xl:grid-cols-[330px_minmax(760px,1fr)] xl:items-start">
          <div>
            <div className="mb-7 flex items-center gap-4">
              <img
                src="/marketing/logo/logo_text_clean.png"
                alt="就活Pass"
                className="h-14 w-44 object-cover"
              />
            </div>
            <p
              className="text-[15px]"
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
            className="footer-nav-grid grid grid-cols-2 gap-x-9 gap-y-8 text-[16px] sm:grid-cols-4 md:gap-x-12"
          >
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title} className={`flex flex-col gap-5 ${col.title === "規約" ? "footer-legal-column" : ""}`}>
                <span
                  className="text-[18px]"
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
                      whiteSpace: "nowrap",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div
          className="mt-10 pt-7 text-center"
          style={{ borderTop: "1px solid var(--lp-border-hairline)" }}
        >
          <p className="text-sm" style={{ color: "var(--lp-muted-text)" }}>
            &copy; 2026 就活Pass . All rights reserved.
          </p>
        </div>
      </div>

      <img
        src={lpSectionAsset("footer/couple.png")}
        alt=""
        role="presentation"
        className="pointer-events-none absolute bottom-[-58px] z-10 hidden select-none object-contain xl:block"
        style={{
          height: "260px",
          right: "max(24px, calc((100vw - 1500px) / 2 + 24px))",
        }}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (min-width: 1280px) {
              .footer-content {
                padding-right: 300px;
              }
              .footer-nav-grid {
                grid-template-columns: repeat(4, max-content);
                column-gap: 58px;
              }
            }
            @media (min-width: 1536px) {
              .footer-nav-grid {
                column-gap: 72px;
              }
            }
            .footer-legal-column {
              min-width: 250px;
            }
            @media (max-width: 639px) {
              .footer-nav-link {
                white-space: normal !important;
              }
            }
          `,
        }}
      />
    </footer>
  );
}
