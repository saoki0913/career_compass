import Link from "next/link";
import Image from "next/image";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-100 bg-white">
      <div className="mx-auto max-w-[1200px] px-6 py-14 lg:px-12">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row">
          <div className="max-w-xs">
            <div className="mb-4 flex items-center gap-2">
              <Image
                src="/icon.png"
                alt="就活Pass"
                width={24}
                height={24}
                className="h-6 w-6"
              />
              <span
                className="text-base text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                就活Pass
              </span>
            </div>
            <p className="text-sm text-slate-400" style={{ lineHeight: 1.7 }}>
              AI技術を活用して、就活生の可能性を最大化し、納得のいくキャリア形成をサポートします。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-4">
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
                  className="text-xs tracking-wide text-slate-900"
                  style={{ fontWeight: 600 }}
                >
                  {col.title}
                </span>
                {col.links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-slate-400 transition-colors hover:text-slate-600"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 border-t border-slate-100 pt-6 text-center">
          <p className="text-xs text-slate-300">&copy; 2026 就活Pass. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
