import Link from "next/link";
import Image from "next/image";

export function LandingFooter() {
  return (
    <footer
      className="border-t px-6 py-16 md:py-20"
      style={{
        backgroundColor: "var(--lp-surface-section)",
        borderColor: "var(--lp-border-default)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between md:gap-16">
          <div className="max-w-sm">
            <div className="mb-4 flex items-center gap-2">
              <Image
                src="/icon.png"
                alt="就活Pass"
                width={28}
                height={28}
                className="h-7 w-7 rounded-md"
              />
              <span
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 600 }}
              >
                就活Pass
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[var(--lp-body-muted)]">
              AI技術を活用して就活生の可能性を最大化し、納得のいくキャリア形成をサポートします。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-12">
            {[
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
            ].map((col) => (
              <div key={col.title} className="flex flex-col gap-3">
                <span
                  className="text-xs uppercase tracking-wider text-[var(--lp-body-muted)]"
                  style={{ fontWeight: 600 }}
                >
                  {col.title}
                </span>
                {col.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm text-[var(--lp-navy)] transition hover:text-[var(--lp-cta)]"
                    style={{ fontWeight: 500 }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div
          className="mt-14 border-t pt-8 text-center"
          style={{ borderColor: "var(--lp-border-default)" }}
        >
          <p className="text-xs text-[var(--lp-body-muted)]">
            © 2026 就活Pass. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
