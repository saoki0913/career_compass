import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { SHUKATSU_KANRI_PAGE_FAQS } from "@/lib/marketing/shukatsu-kanri-faqs";
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
  title: "就活の締切管理アプリを探している方へ | 就活Pass",
  description:
    "就活の締切管理アプリを探している学生向けに、ES 提出・Web テスト・面接・説明会の管理、企業 URL からの選考スケジュール自動抽出、Google カレンダー連携、ES 添削・志望動機 AI との接続を紹介します。",
  path: "/shukatsu-kanri",
  keywords: ["就活 締切 管理", "就活 締切管理 アプリ", "就活 管理 アプリ", "就活 スケジュール 管理", "就活Pass"],
});

export default function ShukatsuKanriPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={SHUKATSU_KANRI_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="就活管理 / スケジュール管理"
          title="就活の締切管理を、ES作成や企業管理と一緒に進める"
          description="就活の締切管理だけを別ツールで行うと、ESや志望動機との往復が増えます。就活Passは、締切管理、ES添削、企業情報整理を一つのアプリで扱いたい人向けの就活管理アプリです。"
        />

        {/* --- 就活Passでできる管理 --- */}
        <LandingContentSection heading="就活Passでできる管理" bg="muted">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                登録すべき締切
              </h3>
              <p
                className="mt-3 text-sm text-slate-600"
                style={{ lineHeight: 1.7 }}
              >
                ES提出、Webテスト、説明会、面接、内定承諾など、就活で抜けやすい期限をまとめて管理できます。
              </p>
            </div>
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                企業ごとの進捗把握
              </h3>
              <p
                className="mt-3 text-sm text-slate-600"
                style={{ lineHeight: 1.7 }}
              >
                応募企業ごとの状況と締切を同じ場所で管理しやすく、優先順位の判断もしやすくなります。
              </p>
            </div>
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                ES作成とつなげやすい
              </h3>
              <p
                className="mt-3 text-sm text-slate-600"
                style={{ lineHeight: 1.7 }}
              >
                締切が見える状態でES添削AIやテンプレと連携し、提出前のタスクを組みやすくします。
              </p>
            </div>
          </div>
        </LandingContentSection>

        {/* --- 関連コンテンツ --- */}
        <LandingContentSection heading="関連コンテンツ">
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/checklists/deadline-management"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  締切管理チェックリスト
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  就活で忘れがちな締切を一覧で確認
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
            </Link>
            <Link
              href="/es-tensaku-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  ES添削AIの紹介
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
              href="/shukatsu-ai"
              className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
            >
              <div>
                <h3
                  className="text-[var(--lp-navy)]"
                  style={{ fontWeight: 700 }}
                >
                  就活AIアプリの全体像
                </h3>
                <p
                  className="mt-1 text-sm text-slate-500"
                  style={{ lineHeight: 1.7 }}
                >
                  ES添削・志望動機・ガクチカ・面接対策の連携
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
                  料金プラン
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
          title="締切管理を、無料で始める"
          description="カード登録不要。企業を登録するだけで締切管理を始められます。"
          primaryCta={{ label: "無料で始める", href: "/login" }}
        />

        <FAQSection faqs={SHUKATSU_KANRI_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              就活の管理を、
              <br />
              スムーズに進めよう。
            </>
          }
          description="企業を登録するだけで、締切管理とES作成を一つの場所で始められます。"
          primaryCta={{ label: "無料で始める", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
