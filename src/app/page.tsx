"use client";

import {
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  TestimonialsSection,
  PricingSection,
  CTASection,
} from "@/components/landing";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main>
        {/* Hero - Product as Hero with floating mockups */}
        <HeroSection />

        {/* Features - Pain points and solutions */}
        <FeaturesSection />

        {/* How it works - 3-step process */}
        <HowItWorksSection />

        {/* Testimonials - Social proof */}
        <TestimonialsSection />

        {/* Pricing - Free plan emphasis */}
        <PricingSection />

        {/* Final CTA - Peak-end rule */}
        <CTASection />
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>&copy; 2025 ウカルン. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-foreground transition-colors">
                利用規約
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                プライバシーポリシー
              </a>
              <a href="#" className="hover:text-foreground transition-colors">
                お問い合わせ
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
