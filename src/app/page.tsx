import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProofStrip } from "@/components/landing/SocialProofStrip";
import { PainPointsSection } from "@/components/landing/PainPointsSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";

export default function Home() {
  return (
    <div className="landing-shell flex min-h-screen flex-col bg-background text-foreground font-sans">
      {/* Sticky Header */}
      <LandingHeader />

      <main className="flex-1 pt-16">
        {/* Hero - Product as Hero with floating mockups */}
        <HeroSection />

        {/* Social Proof - Trust badges */}
        <SocialProofStrip />

        {/* Pain Points - Persona empathy */}
        <PainPointsSection />

        {/* Features - Solutions to pain points */}
        <FeaturesSection />

        {/* How it works - 3-step process */}
        <HowItWorksSection />

        {/* Situations - Even in your state, you can start */}
        <TestimonialsSection />

        {/* Comparison - Why 就活Pass */}
        <ComparisonSection />

        {/* Pricing - 3-tier with decoy effect */}
        <PricingSection />

        {/* FAQ - Common questions with JSON-LD */}
        <FAQSection />

        {/* Final CTA - Peak-end rule */}
        <CTASection />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-background py-12">
        <div className="container mx-auto px-4">
          <div className="landing-panel grid grid-cols-1 gap-8 rounded-xl px-6 py-8 shadow-none sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
            {/* Brand */}
            <div>
              <p className="mb-3 text-lg font-bold tracking-tight">就活Pass</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                就活の準備を、整理して進めるためのアプリ。
                <br />
                ES、志望動機、締切管理をひとつにまとめます。
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="mb-3 text-sm font-medium">プロダクト</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="transition-colors hover:text-foreground">
                    機能
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="transition-colors hover:text-foreground">
                    料金プラン
                  </a>
                </li>
                <li>
                  <Link href="/tools" className="transition-colors hover:text-foreground">
                    無料ツール
                  </Link>
                </li>
                <li>
                  <Link href="/templates" className="transition-colors hover:text-foreground">
                    テンプレ集
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="transition-colors hover:text-foreground">
                    よくある質問
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="mb-3 text-sm font-medium">法的情報</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/terms" className="transition-colors hover:text-foreground">
                    利用規約
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="transition-colors hover:text-foreground">
                    プライバシーポリシー
                  </Link>
                </li>
                <li>
                  <Link href="/legal" className="transition-colors hover:text-foreground">
                    特定商取引法に基づく表記
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <p className="mb-3 text-sm font-medium">サポート</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/contact" className="transition-colors hover:text-foreground">
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 text-center text-sm text-muted-foreground">
            <p>&copy; 2026 就活Pass. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
