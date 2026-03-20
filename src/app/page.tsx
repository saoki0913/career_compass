import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingHighlights } from "@/components/landing/LandingHighlights";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { ComparisonSection } from "@/components/landing/ComparisonSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";

function SectionDivider() {
  return <div className="mx-auto max-w-6xl border-b border-border/20" />;
}

export default function Home() {
  return (
    <div className="landing-shell flex min-h-screen flex-col bg-background text-foreground font-sans">
      <LandingHeader />

      <main className="flex-1 pt-16">
        <HeroSection />

        <LandingHighlights />

        <SectionDivider />

        <ProductShowcase />

        {/* dark ↔ light transition — no divider needed */}
        <ComparisonSection />

        <SectionDivider />

        <PricingSection />

        <SectionDivider />

        <FAQSection />

        {/* dark ↔ light transition — no divider needed */}
        <CTASection />
      </main>

      <footer className="border-t border-border/50 bg-background py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-8 rounded-xl px-6 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
            <div>
              <p className="mb-3 text-lg font-bold tracking-tight">就活Pass</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                AI添削・志望動機・ガクチカの整理と、企業・締切・カレンダーをひとつのアプリで。
              </p>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">プロダクト</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#highlights" className="transition-colors hover:text-foreground">
                    要点
                  </a>
                </li>
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
