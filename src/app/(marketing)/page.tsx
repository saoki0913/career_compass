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
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";

export default function Home() {
  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--lp-surface-section)] font-['Inter','Noto_Sans_JP',sans-serif] text-[var(--lp-navy)]"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main className="pb-24 pt-14 md:pb-0 md:pt-16">
        <FaqJsonLd faqs={LANDING_PAGE_FAQS} />

        <HeroSection />

        <TrustStripSection />

        <PainPointsSection />

        <BeforeAfterSection />

        <FeatureESSection />

        <FeatureManagementSection />

        <FeatureInterviewSection />

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
