import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { AI_MENSETSU_PAGE_FAQS } from "@/lib/marketing/ai-mensetsu-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { AiMensetsuHeroSection } from "@/components/landing/ai-mensetsu/AiMensetsuHeroSection";
import { AiMensetsuPainPointsSection } from "@/components/landing/ai-mensetsu/AiMensetsuPainPointsSection";
import { AiMensetsuFeatureFormatsSection } from "@/components/landing/ai-mensetsu/AiMensetsuFeatureFormatsSection";
import { AiMensetsuFeatureScoringSection } from "@/components/landing/ai-mensetsu/AiMensetsuFeatureScoringSection";
import { AiMensetsuFeatureFlowSection } from "@/components/landing/ai-mensetsu/AiMensetsuFeatureFlowSection";

export const metadata: Metadata = createMarketingMetadata({
  title: "AI 面接対策・模擬面接AIを探している方へ | 就活Pass",
  description:
    "AI 面接対策や模擬面接 AI を探している就活生向けに、就活Pass の企業別 AI 模擬面接の進め方、4 方式（行動面接 / ケース面接 / 技術面接 / 人生史面接）、7 軸講評、料金までをまとめました。",
  path: "/ai-mensetsu",
  keywords: [
    "AI 面接対策",
    "模擬面接 AI",
    "企業別 面接対策",
    "面接 練習 AI",
    "AI 模擬面接",
    "就活Pass",
  ],
});

export default function AiMensetsuPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] text-slate-900 bg-white overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={AI_MENSETSU_PAGE_FAQS} />

        <AiMensetsuHeroSection />

        <AiMensetsuPainPointsSection />

        <AiMensetsuFeatureFormatsSection />

        <AiMensetsuFeatureScoringSection />

        <AiMensetsuFeatureFlowSection />

        <MidCTASection
          title="AI 模擬面接を、無料で試す"
          description="カード登録不要。Free プランの月 50 クレジットから試せます（最終講評 1 回 = 6 クレジット）。"
          primaryCta={{ label: "無料で試す", href: "/login" }}
        />

        <FAQSection faqs={AI_MENSETSU_PAGE_FAQS} />

        <FinalCTASection
          title={<>企業別の面接対策を、AI と今すぐ。</>}
          description="登録した会社の情報をもとに、AI 面接官が 1 問ずつ深掘り。終わったら 7 軸で講評します。"
          primaryCta={{ label: "無料で AI 模擬面接を試す", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
