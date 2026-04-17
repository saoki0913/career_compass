import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { GAKUCHIKA_AI_PAGE_FAQS } from "@/lib/marketing/gakuchika-ai-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { GakuchikaAiHeroSection } from "@/components/landing/gakuchika-ai/GakuchikaAiHeroSection";
import { GakuchikaAiPainPointsSection } from "@/components/landing/gakuchika-ai/GakuchikaAiPainPointsSection";
import { GakuchikaAiFeaturePhaseSection } from "@/components/landing/gakuchika-ai/GakuchikaAiFeaturePhaseSection";
import { GakuchikaAiFeatureStarSection } from "@/components/landing/gakuchika-ai/GakuchikaAiFeatureStarSection";
import { GakuchikaAiFeatureInterviewReadySection } from "@/components/landing/gakuchika-ai/GakuchikaAiFeatureInterviewReadySection";

export const metadata: Metadata = createMarketingMetadata({
  title: "ガクチカをAIで深掘り・ES化する｜ガクチカAI | 就活Pass",
  description:
    "ガクチカ AI を探している就活生向けに、就活Pass のガクチカ作成機能の 4 フェーズ（ES 材料フェーズ / ES 作成可 / 面接向け深掘り / 面接準備完了）、STAR 4 要素、面接準備パック、料金をまとめました。",
  path: "/gakuchika-ai",
  keywords: [
    "ガクチカ AI",
    "ガクチカ 深掘り AI",
    "ガクチカ 作り方",
    "ガクチカ 面接",
    "ガクチカ テンプレ",
    "就活Pass",
  ],
});

export default function GakuchikaAiPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] text-slate-900 bg-white overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={GAKUCHIKA_AI_PAGE_FAQS} />

        <GakuchikaAiHeroSection />

        <GakuchikaAiPainPointsSection />

        <GakuchikaAiFeaturePhaseSection />

        <GakuchikaAiFeatureStarSection />

        <GakuchikaAiFeatureInterviewReadySection />

        <MidCTASection
          title="ガクチカ AI を、無料で試す"
          description="カード登録不要。Free プランの月 50 クレジットから試せます。"
          primaryCta={{ label: "無料で試す", href: "/login" }}
        />

        <FAQSection faqs={GAKUCHIKA_AI_PAGE_FAQS} />

        <FinalCTASection
          title={<>ガクチカを、ES と面接の両方で仕上げる。</>}
          description="同じ会話で ES 材料 → 下書き → 面接向け深掘り → 面接準備パックまで。"
          primaryCta={{ label: "無料でガクチカ AI を試す", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
