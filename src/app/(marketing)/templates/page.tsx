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
import { TEMPLATES_PAGE_FAQS } from "@/lib/marketing/templates-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "テンプレ集 | 就活Pass",
  description:
    "志望動機テンプレとガクチカ（STAR）テンプレの一覧です。就活Passで無料で閲覧できます。",
  path: "/templates",
  keywords: ["就活 テンプレ", "志望動機 テンプレ", "ガクチカ STAR", "就活Pass テンプレ"],
});

export default function TemplatesPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={TEMPLATES_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="テンプレ集"
          title="テンプレ集"
          description="志望動機・ガクチカの書き始めに使えるテンプレートを公開しています。"
        />

        <LandingContentSection heading="テンプレートを選ぶ" bg="muted">
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
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  「なぜこの会社か」を、結論から書く流れの例です。
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

            <Link
              href="/templates/gakuchika-star"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ガクチカ STAR テンプレ
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  経験を S / T / A / R に分けて書くための例です。
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "S", text: "状況" },
                    { label: "T", text: "課題" },
                    { label: "A", text: "行動" },
                    { label: "R", text: "結果" },
                  ].map((item) => (
                    <span
                      key={item.label}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-center text-xs text-slate-600"
                      style={{ fontWeight: 500 }}
                    >
                      {item.label} {item.text}
                    </span>
                  ))}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
          </div>
        </LandingContentSection>

        <LandingContentSection heading="アプリで続ける">
          <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
            <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
              <p
                className="text-sm text-slate-600"
                style={{ lineHeight: 1.7 }}
              >
                企業登録、締切、ESの保存、AI添削はログイン後に利用できます。
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
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
        </LandingContentSection>

        <MidCTASection title="テンプレから始める" />

        <FAQSection faqs={TEMPLATES_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              ESの準備を、
              <br />
              テンプレから始めよう。
            </>
          }
        />
      </main>

      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
