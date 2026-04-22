import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { SHUKATSU_AI_PAGE_FAQS } from "@/lib/marketing/shukatsu-ai-faqs";
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
  title: "就活AI・就活 AI アプリ｜ES・志望動機・ガクチカ・AI模擬面接までまとめる | 就活Pass",
  description:
    "就活 AI アプリを探している学生向けに、就活Pass の ES 添削 AI・志望動機 AI・ガクチカ AI・企業別 AI 模擬面接の全体像、個別機能ページへの導線、無料導線をまとめました。",
  path: "/shukatsu-ai",
  keywords: [
    "就活AI",
    "就活 AI アプリ",
    "AI 就活",
    "就活 アプリ",
    "就活 AI 無料",
    "就活Pass",
  ],
});

const features = [
  {
    href: "/es-tensaku-ai",
    title: "ES 添削 AI",
    description:
      "志望動機・自己PR・ガクチカなど設問タイプ別の専用テンプレで添削。登録企業の情報を自動反映。",
  },
  {
    href: "/shiboudouki-ai",
    title: "志望動機 AI",
    description:
      "6 要素スロットで会話しながら材料を揃え、300 / 400 / 500 字の ES 下書きまで生成。",
  },
  {
    href: "/gakuchika-ai",
    title: "ガクチカ AI",
    description:
      "STAR 4 要素を 4〜6 問で揃え、ES 生成後は面接向け deepdive・面接準備パックまで。",
  },
  {
    href: "/ai-mensetsu",
    title: "AI 模擬面接",
    description:
      "企業別に 4 方式の質問を生成。7 軸で講評し、最弱設問の改善後の回答例まで提示。",
  },
];

const freeTools = [
  { href: "/tools/es-counter", label: "ES文字数カウント（無料）" },
  { href: "/templates/shiboudouki", label: "志望動機テンプレート" },
  { href: "/templates/gakuchika-star", label: "ガクチカ STAR テンプレート" },
  { href: "/shukatsu-kanri", label: "就活の締切管理アプリの使い方" },
];

export default function ShukatsuAiPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] bg-white text-slate-900 overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={SHUKATSU_AI_PAGE_FAQS} />

        <SeoLPHeroSection
          eyebrow="就活AI / 就活AIアプリ"
          title="就活AIを、ESだけで終わらせない"
          description="就活Passは、ES添削AI・志望動機AI・ガクチカAI・企業別AI模擬面接・企業情報の自動取り込み・締切管理までを1つのアプリにまとめた就活AIアプリです。"
          secondaryCta={{ label: "機能を見る", href: "#features" }}
        />

        {/* --- 就活AIとしての使いどころ --- */}
        <LandingContentSection heading="就活AIとしての使いどころ" bg="muted">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--lp-border-default)] bg-white p-6 shadow-[var(--lp-shadow-card)]">
              <h3
                className="text-lg text-[var(--lp-navy)]"
                style={{ fontWeight: 700 }}
              >
                就活AIとしての使いどころ
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  "ESや志望動機の下書きを整える",
                  "ガクチカを会話形式で深掘りする",
                  "企業別 AI 模擬面接で話した時の説得力まで確認する",
                  "企業ごとの選考状況と締切を 1 箇所に集める",
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
                こんな人に向いています
              </h3>
              <ul className="mt-4 space-y-2.5">
                {[
                  "就活塾ほど高額な支援は避けたい",
                  "無料ツールだけでは不安が残る",
                  "ChatGPT にプロンプトを毎回設計し直すのがつらい",
                  "何から始めるか迷わず進めたい",
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

        {/* --- 機能別ページから深掘りする --- */}
        <LandingContentSection
          heading="機能別ページから深掘りする"
          description="各機能の詳細・対応範囲・料金は個別ページにまとめています。使いたい機能から入ってください。"
          id="features"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
              >
                <div>
                  <h3
                    className="text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    {f.title}
                  </h3>
                  <p
                    className="mt-1 text-sm text-slate-500"
                    style={{ lineHeight: 1.7 }}
                  >
                    {f.description}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
              </Link>
            ))}
          </div>
        </LandingContentSection>

        {/* --- 無料ツール・テンプレから始める --- */}
        <LandingContentSection
          heading="無料ツール・テンプレから始める"
          description="無料ツールやテンプレから入り、必要に応じて就活AI機能や管理機能へ広げられる構成です。"
          bg="muted"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {freeTools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group flex items-center justify-between rounded-xl border border-[var(--lp-border-default)] bg-white p-5 shadow-[var(--lp-shadow-card)] transition-all hover:shadow-md"
              >
                <span
                  className="text-sm text-[var(--lp-navy)]"
                  style={{ fontWeight: 600 }}
                >
                  {tool.label}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-[var(--lp-navy)]" />
              </Link>
            ))}
          </div>
        </LandingContentSection>

        <MidCTASection
          title="まずは無料で、就活AIを試す"
          description="カード登録不要。ESを貼り付けるだけで始められます。"
          primaryCta={{ label: "無料で試す", href: "/login" }}
        />

        <FAQSection faqs={SHUKATSU_AI_PAGE_FAQS} />

        <FinalCTASection
          title={
            <>
              就活を、AIと一緒に
              <br />
              迷わず進めよう。
            </>
          }
          description="ESを貼り付けるだけで、AIが改善案を提示します。"
          primaryCta={{ label: "無料で始める", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
