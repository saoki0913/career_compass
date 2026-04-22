import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
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
import { GAKUCHIKA_STAR_TEMPLATE_PAGE_FAQS } from "@/lib/marketing/gakuchika-star-template-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "ガクチカSTARテンプレ | 就活Pass",
  description:
    "ガクチカをSTARで整理する無料テンプレです。面接で深掘りされても崩れない骨格を作り、アプリへつなげます。",
  path: "/templates/gakuchika-star",
  keywords: ["ガクチカ STAR", "ガクチカ テンプレ", "学生時代に力を入れたこと 書き方"],
});

export default function GakuchikaStarTemplatePage() {
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
            { name: "ガクチカSTARテンプレ", path: "/templates/gakuchika-star" },
          ]}
        />
        <FaqJsonLd faqs={GAKUCHIKA_STAR_TEMPLATE_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="テンプレ集 · ガクチカ STAR"
          title="ガクチカ STAR テンプレート"
          description="状況→課題→行動→結果のSTAR法で、ガクチカを論理的に整理できます。"
        />

        <LandingContentSection heading="STARの型と書き出し例" bg="muted">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* STAR型 */}
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                STAR の型
              </h3>
              <div className="mt-4 space-y-3">
                {[
                  { label: "S", text: "状況を短く置く。いつ / どこで / 何が起きたか。" },
                  { label: "T", text: "課題を具体にする。何が難しかったかを一文で。" },
                  { label: "A", text: "行動を分けて書く。工夫は 2~3 個に絞る。" },
                  { label: "R", text: "結果と学びで締める。再現性まで見せる。" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <p
                      className="text-xs tracking-wider text-[var(--lp-navy)]"
                      style={{ fontWeight: 700 }}
                    >
                      {item.label}
                    </p>
                    <p
                      className="mt-1 text-sm text-slate-600"
                      style={{ lineHeight: 1.7 }}
                    >
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

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
                  {"{状況}"}の中で、{"{課題}"}を解決するために、{"{自分の行動}"}を行いました。
                  その結果、{"{結果}"}という学びを得ました。
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  "数字を 1 つ入れる",
                  "工夫を 2~3 個に絞る",
                  "結果は学びまで含める",
                  "話し言葉になりすぎない",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3"
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

        <LandingContentSection heading="気をつけるポイント">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* つまずきポイント */}
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                よくあるつまずき
              </h3>
              <ul className="mt-4 space-y-3">
                {[
                  "出来事の説明が長く、何をしたかが見えない",
                  "結果が成果だけで終わり、学びが抜ける",
                  "再現性がなく、その人らしさが伝わらない",
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
                  "S は短く、背景を足しすぎない",
                  "T は定量があると伝わりやすい",
                  "A は意思決定を中心に書く",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
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
              href="/gakuchika-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ガクチカAIの使い方
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  STAR整理からES生成・深掘りまで
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>

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
                  結論から書く構成テンプレ
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
          </div>
        </LandingContentSection>

        <MidCTASection title="ガクチカAIを、無料で試す" />

        <FAQSection faqs={GAKUCHIKA_STAR_TEMPLATE_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              ガクチカを、
              <br />
              ESと面接の両方で仕上げる。
            </>
          }
        />
      </main>

      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
