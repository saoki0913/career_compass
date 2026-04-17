import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { SeoLPHeroSection } from "@/components/landing/shared/SeoLPHeroSection";
import { LandingContentSection } from "@/components/landing/shared/LandingContentSection";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { TOOLS_PAGE_FAQS } from "@/lib/marketing/tools-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "無料ツール | 就活Pass",
  description:
    "ES文字数カウントとテンプレをまとめた、就活Passの無料公開ページです。下準備を短くして、そのままアプリの管理体験へつなげます。",
  path: "/tools",
  keywords: ["ES 文字数 カウント", "就活 無料ツール", "就活Pass ツール", "志望動機 テンプレ"],
});

export default function ToolsPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={TOOLS_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="無料ツール"
          title="無料ツール"
          description="ESの文字数カウントと、志望動機のテンプレがあります。"
          secondaryCta={{ label: "テンプレ集を見る", href: "/templates" }}
        />

        <LandingContentSection heading="ES文字数カウント" bg="muted">
          <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  className="text-lg text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  300 / 400 / 500字を確認
                </h3>
                <p
                  className="mt-2 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  空白・改行を除いた文字数でも数えられます。
                </p>
              </div>
              <span
                className="hidden shrink-0 rounded-full bg-[var(--lp-tint-navy-soft)] px-3 py-1 text-xs text-[var(--lp-navy)] sm:inline-flex"
                style={{ fontWeight: 600 }}
              >
                無料
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["空白除外", "改行除外"].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                  style={{ fontWeight: 500 }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/tools/es-counter"
                className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-cta)] px-7 py-3.5 text-sm text-white shadow-lg shadow-blue-900/10 transition-all hover:shadow-xl hover:shadow-blue-900/15 active:scale-[0.98]"
                style={{ fontWeight: 600 }}
              >
                ES文字数カウントを使う
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/templates/shiboudouki"
                className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-[var(--lp-navy)]"
                style={{ fontWeight: 500 }}
              >
                志望動機の型を見る
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </div>
          </div>
        </LandingContentSection>

        <LandingContentSection heading="テンプレ・アプリへの導線">
          <div className="grid gap-6 lg:grid-cols-2">
            <Link
              href="/templates/shiboudouki"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  志望動機テンプレ
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  結論→根拠→企業接続→再現性の流れで書き始められます。
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["結論", "根拠", "企業接続", "再現性"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600"
                      style={{ fontWeight: 500 }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>

            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                アプリで続ける
              </h3>
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
                <p
                  className="text-sm text-slate-600"
                  style={{ lineHeight: 1.7 }}
                >
                  企業登録、締切、ESの保存、AI添削をまとめて使えます。
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-cta)] px-7 py-3.5 text-sm text-white shadow-lg shadow-blue-900/10 transition-all hover:shadow-xl hover:shadow-blue-900/15 active:scale-[0.98]"
                  style={{ fontWeight: 600 }}
                >
                  アプリで続ける
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 text-sm text-slate-600 transition-colors hover:text-[var(--lp-navy)]"
                  style={{ fontWeight: 500 }}
                >
                  料金を見る
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              </div>
            </div>
          </div>
        </LandingContentSection>

        <MidCTASection title="無料ツールを試す" />

        <FAQSection faqs={TOOLS_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              ESの準備を、
              <br />
              今すぐ始めよう。
            </>
          }
        />
      </main>

      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
