import Link from "next/link";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { PricingSection } from "@/components/landing/PricingSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";

export default function Home() {
  return (
    <div className="landing-shell flex min-h-screen flex-col bg-background text-foreground font-sans">
      <LandingHeader />

      <main className="flex-1 pt-16">
        <FaqJsonLd faqs={LANDING_PAGE_FAQS} />
        <HeroSection />

        <ProductShowcase />

        <PricingSection />

        <FAQSection />

        <CTASection />
      </main>

      <footer className="border-t border-slate-200/80 bg-white/80 py-16 backdrop-blur">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
            <div className="max-w-sm">
              <p className="mb-3 text-lg font-semibold tracking-tight text-slate-950">就活Pass</p>
              <p className="text-sm leading-7 text-slate-600">
                ES添削、志望動機・ガクチカの対話支援、企業管理、締切管理を
                ひと続きで進める就活支援アプリです。
              </p>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Product
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>
                  <a href="#features" className="transition-colors hover:text-slate-950">
                    機能
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="transition-colors hover:text-slate-950">
                    料金
                  </a>
                </li>
                <li>
                  <a href="#faq" className="transition-colors hover:text-slate-950">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link href="/login" className="transition-colors hover:text-slate-950">
                    無料で始める
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Public Pages
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>
                  <Link href="/tools" className="transition-colors hover:text-slate-950">
                    無料ツール
                  </Link>
                </li>
                <li>
                  <Link href="/templates" className="transition-colors hover:text-slate-950">
                    テンプレ集
                  </Link>
                </li>
                <li>
                  <Link href="/tools/es-counter" className="transition-colors hover:text-slate-950">
                    ES文字数カウント
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Legal
              </p>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>
                  <Link href="/terms" className="transition-colors hover:text-slate-950">
                    利用規約
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="transition-colors hover:text-slate-950">
                    プライバシーポリシー
                  </Link>
                </li>
                <li>
                  <Link href="/legal" className="transition-colors hover:text-slate-950">
                    特定商取引法に基づく表記
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="transition-colors hover:text-slate-950">
                    お問い合わせ
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-200/80 pt-6 text-center text-sm text-slate-500">
            <p>&copy; 2026 就活Pass. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
