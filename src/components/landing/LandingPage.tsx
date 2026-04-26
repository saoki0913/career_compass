import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";
import { StickyCTABar } from "./StickyCTABar";
import { HeroSection } from "./sections/HeroSection";
import { PainPointsSection } from "./sections/PainPointsSection";
import { FeaturesSection } from "./sections/FeaturesSection";
import { BeforeAfterSection } from "./sections/BeforeAfterSection";
import { HowToUseSection } from "./sections/HowToUseSection";
import { PricingSection } from "./sections/PricingSection";
import { LPFAQSection } from "./sections/LPFAQSection";

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <LandingHeader />
      <main>
        <HeroSection />
        <PainPointsSection />
        <FeaturesSection />
        <BeforeAfterSection />
        <HowToUseSection />
        <PricingSection />
        <LPFAQSection />
      </main>
      <LandingFooter />
      <StickyCTABar />
    </div>
  );
}
