import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { SeoLPHeroSection } from "@/components/landing/shared/SeoLPHeroSection";
import { LandingContentSection } from "@/components/landing/shared/LandingContentSection";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { SHIBOUDOUKI_TEMPLATE_PAGE_FAQS } from "@/lib/marketing/shiboudouki-template-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "志望動機テンプレ | 就活Pass",
  description:
    "志望動機を結論から書くための無料テンプレです。構成、書き出し、注意点を整理して、アプリへつなげます。",
  path: "/templates/shiboudouki",
  keywords: ["志望動機 テンプレ", "志望動機 書き方", "ES 志望動機 例文"],
});

export default function ShiboudoukiTemplatePage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <BreadcrumbJsonLd
          crumbs={[
            { name: "ホーム", path: "/" },
            { name: "テンプレ集", path: "/templates" },
            { name: "志望動機テンプレ", path: "/templates/shiboudouki" },
          ]}
        />
        <FaqJsonLd faqs={SHIBOUDOUKI_TEMPLATE_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="テンプレ集 · 志望動機"
          title="志望動機テンプレート"
          description="結論→根拠→企業接続→再現性の4段構成で書き始められます。"
        />

        <LandingContentSection heading="書き出し例と構成" bg="muted">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* 書き出し例 */}
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                書き出し例
              </h3>
              <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p
                  className="text-sm text-slate-500"
                  style={{ fontWeight: 500 }}
                >
                  例
                </p>
                <p
                  className="mt-2 text-sm text-slate-700"
                  style={{ lineHeight: 1.7 }}
                >
                  私が貴社を志望する理由は、{"{結論}"}を実現したいからです。
                  その背景には、{"{根拠}"}と{"{企業接続}"}があります。
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {["結論", "根拠", "企業接続"].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-slate-200 bg-[var(--lp-tint-navy-soft)] px-3 py-1 text-xs text-[var(--lp-navy)]"
                    style={{ fontWeight: 500 }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* 構成5段 */}
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                構成（5段）
              </h3>
              <div className="mt-4 space-y-3">
                {[
                  { label: "1. 結論", text: "志望理由を一文で言い切る。" },
                  { label: "2. 原体験", text: "その志向になった経験を置く。" },
                  { label: "3. 企業接続", text: "事業 / 強み / 取り組みとつなぐ。" },
                  { label: "4. 再現性", text: "入社後に活かせる強みを示す。" },
                  { label: "5. 入社後", text: "何をどう学びたいかまで書く。" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <p
                      className="text-sm text-slate-800"
                      style={{ fontWeight: 600 }}
                    >
                      {item.label}
                    </p>
                    <p
                      className="mt-1 text-sm text-slate-500"
                      style={{ lineHeight: 1.7 }}
                    >
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </LandingContentSection>

        <LandingContentSection heading="気をつけるポイント">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* NGパターン */}
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                NGになりやすい形
              </h3>
              <ul className="mt-4 space-y-3">
                {[
                  "企業接続が「理念に共感」で止まる",
                  "原体験が長く、結論が見えない",
                  "入社後が「成長したい」で止まる",
                ].map((item) => (
                  <li
                    key={item}
                    className="text-sm text-slate-600"
                    style={{ lineHeight: 1.7 }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* 整えるコツ */}
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                整えるコツ
              </h3>
              <div className="mt-4 space-y-3">
                {[
                  "数字を 1 つ入れる",
                  "行動には意思決定と検証を含める",
                  "結果は成果と学びで締める",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
                    <p
                      className="text-sm text-slate-700"
                      style={{ lineHeight: 1.7 }}
                    >
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </LandingContentSection>

        <LandingContentSection heading="次のステップ" bg="muted">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/shiboudouki-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  志望動機AIの使い方
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  対話で材料を整理し下書きを生成
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>

            <Link
              href="/tools/es-counter"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ES文字数カウント
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  300 / 400 / 500字を確認
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>

            <Link
              href="/login"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  アプリで続ける
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  保存・添削・締切管理はログイン後
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
          </div>
        </LandingContentSection>

        <MidCTASection title="志望動機AIを、無料で試す" />

        <FAQSection faqs={SHIBOUDOUKI_TEMPLATE_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              志望動機を、
              <br />
              AIと一緒に仕上げる。
            </>
          }
        />
      </main>

      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
