import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustStripSection } from "@/components/landing/TrustStripSection";
import { PainPointsSection } from "@/components/landing/PainPointsSection";
import { BeforeAfterSection } from "@/components/landing/BeforeAfterSection";
import { FeatureESSection } from "@/components/landing/FeatureESSection";
import { FeatureManagementSection } from "@/components/landing/FeatureManagementSection";
import { FeatureInterviewSection } from "@/components/landing/FeatureInterviewSection";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { QualitySection } from "@/components/landing/QualitySection";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getMarketingDescription } from "@/lib/seo/site-structured-data";

/**
 * LP トップの metadata。
 * タイトルは「便益 + 対象者」型でキーワードを自然に含みつつ Google の title rewrite を避ける。
 * description は SSOT（`getMarketingDescription("/")`）から取得。
 */
export const metadata: Metadata = createMarketingMetadata({
  title: "就活Pass | ES添削・志望動機をAIで。就活塾に行かずに進める学生のための就活アプリ",
  description: getMarketingDescription("/"),
  path: "/",
});

export default function Home() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] text-slate-900 bg-white overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={LANDING_PAGE_FAQS} />

        <HeroSection />

        <TrustStripSection />

        <PainPointsSection />

        <BeforeAfterSection />

        <FeatureESSection />

        <FeatureManagementSection />

        <FeatureInterviewSection />

        <MidCTASection />

        <HowItWorksSection />

        <QualitySection />

        <ComparisonSection />

        <PricingSection />

        <FAQSection />

        <FinalCTASection />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
