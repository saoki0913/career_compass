import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { ENTRY_SHEET_AI_PAGE_FAQS } from "@/lib/marketing/entry-sheet-ai-faqs";
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
  title: "エントリーシート添削・ES添削 AI | 就活Pass",
  description:
    "エントリーシート（ES）添削と ES 添削 AI の違い、就活Pass の設問タイプ別専用テンプレ、登録企業の情報自動反映、Free 50 クレジットで試せる範囲を就活生向けに整理しました。",
  path: "/entry-sheet-ai",
  keywords: [
    "エントリーシート 添削",
    "エントリーシート 添削 AI",
    "ES 添削",
    "ES添削 AI",
    "就活Pass",
  ],
});

export default function EntrySheetAiPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={ENTRY_SHEET_AI_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="ES添削 / エントリーシート添削"
          title="エントリーシート添削とES添削AIを探している方へ"
          description="就活では「エントリーシート」「ES」「エントリー」と呼ばれる提出物を、企業ごとの設問に合わせて書きます。就活PassのES添削AIは、設問タイプに合わせた改善ポイントの整理や下書き段階からのブラッシュアップに使えます。志望動機・ガクチカ・締切管理とも同じアプリ内でつながります。"
        />

        {/* --- 言葉の整理 --- */}
        <LandingContentSection heading="言葉の整理" bg="muted">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                エントリーシートとESの違い
              </h3>
              <p
                className="mt-3 text-sm text-slate-600"
                style={{ lineHeight: 1.7 }}
              >
                エントリーシートとESは、文脈によって同じ書類を指すことが多いです。検索では「ES添削」「エントリーシート添削」「ES
                AI」など表記が分かれますが、就活Passではどちらの検索意図でも同じESエディタと添削フローで対応できます。
              </p>
            </div>
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                単発ツールとの違い
              </h3>
              <p
                className="mt-3 text-sm text-slate-600"
                style={{ lineHeight: 1.7 }}
              >
                文字数カウントだけのツールとは異なり、添削結果を企業・締切・他の設問と一緒に管理しやすい構成です。ES添削だけで終わらず、就活AIとして志望動機やガクチカにも広げられます。
              </p>
            </div>
          </div>
        </LandingContentSection>

        {/* --- 次のステップ --- */}
        <LandingContentSection
          heading="次のステップ"
          description="ES添削AIの機能詳細とFAQは専用ガイドにまとめています。"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/es-tensaku-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ES添削AI・ES AI ガイド
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  設問タイプ別テンプレ、企業情報自動反映、料金の詳細
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
            <Link
              href="/es-ai-guide"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ES AI の選び方（単発ツールと一体型）
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  どちらが向いているか判断するためのガイド
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

        <FAQSection faqs={ENTRY_SHEET_AI_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              設問ごとの添削を、
              <br />
              AIと今すぐ。
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
