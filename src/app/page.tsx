"use client";

import {
  LandingHeader,
  HeroSection,
  SocialProofStrip,
  FeaturesSection,
  HowItWorksSection,
  ComparisonSection,
  TestimonialsSection,
  PricingSection,
  FAQSection,
  CTASection,
} from "@/components/landing";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Sticky Header */}
      <LandingHeader />

      <main className="pt-16">
        {/* Hero - Product as Hero with floating mockups */}
        <HeroSection />

        {/* Social Proof - Trust badges */}
        <SocialProofStrip />

        {/* Features - Pain points and solutions */}
        <FeaturesSection />

        {/* How it works - 3-step process */}
        <HowItWorksSection />

        {/* Comparison - Why ウカルン */}
        <ComparisonSection />

        {/* Feature Showcase */}
        <TestimonialsSection />

        {/* Pricing - 3-tier with decoy effect */}
        <PricingSection />

        {/* FAQ - Common questions with JSON-LD */}
        <FAQSection />

        {/* Final CTA - Peak-end rule */}
        <CTASection />
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50 bg-secondary/20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            {/* Brand */}
            <div>
              <p className="font-bold text-lg mb-2">ウカルン</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AIと進捗管理で就活をサポート。
                <br />
                ES添削・締切管理・企業研究をひとつに。
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="font-medium text-sm mb-3">プロダクト</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-foreground transition-colors">
                    機能
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-foreground transition-colors">
                    料金プラン
                  </a>
                </li>
                <li>
                  <Link href="/tools" className="hover:text-foreground transition-colors">
                    無料ツール
                  </Link>
                </li>
                <li>
                  <Link href="/templates" className="hover:text-foreground transition-colors">
                    テンプレ集
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="hover:text-foreground transition-colors">
                    よくある質問
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="font-medium text-sm mb-3">法的情報</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/terms" className="hover:text-foreground transition-colors">
                    利用規約
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground transition-colors">
                    プライバシーポリシー
                  </Link>
                </li>
                <li>
                  <Link href="/legal" className="hover:text-foreground transition-colors">
                    特定商取引法に基づく表記
                  </Link>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <p className="font-medium text-sm mb-3">サポート</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link href="/contact" className="hover:text-foreground transition-colors">
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-border/50 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 ウカルン. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
