import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { ES_AI_GUIDE_PAGE_FAQS } from "@/lib/marketing/es-ai-guide-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { SeoLPHeroSection } from "@/components/landing/shared/SeoLPHeroSection";
import { LandingContentSection } from "@/components/landing/shared/LandingContentSection";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";

export const metadata: Metadata = createMarketingMetadata({
  title: "ES AI の選び方 | 単発ツールと一体型の就活アプリ",
  description:
    "ES AI・ES 添削 AI を選ぶときの観点（単発で済ませるか、ES・志望動機・ガクチカ・面接対策・締切管理まで含めるか）と、就活Pass の位置づけを整理しました。",
  path: "/es-ai-guide",
  keywords: ["ES AI", "ES添削 AI", "エントリーシート AI", "就活 アプリ 比較", "就活Pass"],
});

export default function EsAiGuidePage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={ES_AI_GUIDE_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="ES AI / 選び方ガイド"
          title="ES AIを選ぶときの考え方"
          description="ES添削AIは、文章を一気に書き換えるものから、設問ごとに観点を整理するものまで幅があります。さらに「添削だけで終わらせず、提出期限や他の設問と一緒に管理したい」かどうかで、向いているサービスが変わります。"
        />

        {/* --- 単発型と一体型の比較 --- */}
        <LandingContentSection heading="単発型と一体型の比較" bg="muted">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                単発型が向く場合
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  "その場で文字数や表現だけ整えればよい",
                  "締切や企業管理は別ツールで十分",
                  "ログインなしの軽い利用を優先したい",
                ].map((text) => (
                  <li
                    key={text}
                    className="flex items-start gap-2.5 text-sm text-slate-600"
                    style={{ lineHeight: 1.7 }}
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lp-navy)]" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                一体型（就活Pass）が向く場合
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  "ES添削と志望動機・ガクチカを同じ流れで進めたい",
                  "企業ごとの締切やタスクをアプリ内でまとめたい",
                  "就活AIとして継続利用し、クレジットで使い分けたい",
                ].map((text) => (
                  <li
                    key={text}
                    className="flex items-start gap-2.5 text-sm text-slate-600"
                    style={{ lineHeight: 1.7 }}
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lp-navy)]" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </LandingContentSection>

        {/* --- 関連ページ --- */}
        <LandingContentSection heading="関連ページ">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/es-tensaku-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ES添削AIガイド
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  設問タイプ別テンプレと企業情報自動反映の詳細
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
            <Link
              href="/entry-sheet-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  エントリーシート添削とESの整理
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  ES・エントリーシートの用語整理と添削の始め方
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
            <Link
              href="/pricing"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  料金・クレジット
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  Free / Pro プランの比較と料金詳細
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
          </div>
        </LandingContentSection>

        <MidCTASection
          title="ES添削AIを、無料で試す"
          description="カード登録不要。ESを貼り付けるだけで始められます。"
          primaryCta={{ label: "無料で試す", href: "/login" }}
        />

        <FAQSection faqs={ES_AI_GUIDE_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              ESの改善を、
              <br />
              AIと始めよう。
            </>
          }
          description="ESの下書きを貼り付けるだけ。設問タイプに合わせた改善案を提示します。"
          primaryCta={{ label: "無料で ES 添削 AI を試す", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
