import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { SHIBOUDOUKI_AI_PAGE_FAQS } from "@/lib/marketing/shiboudouki-ai-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { ShiboudoukiAiHeroSection } from "@/components/landing/shiboudouki-ai/ShiboudoukiAiHeroSection";
import { ShiboudoukiAiPainPointsSection } from "@/components/landing/shiboudouki-ai/ShiboudoukiAiPainPointsSection";
import { ShiboudoukiAiFeatureSlotsSection } from "@/components/landing/shiboudouki-ai/ShiboudoukiAiFeatureSlotsSection";
import { ShiboudoukiAiFeatureModeSection } from "@/components/landing/shiboudouki-ai/ShiboudoukiAiFeatureModeSection";
import { ShiboudoukiAiFeatureDraftSection } from "@/components/landing/shiboudouki-ai/ShiboudoukiAiFeatureDraftSection";

export const metadata: Metadata = createMarketingMetadata({
  title: "志望動機をAIで作る・整理する｜志望動機AI | 就活Pass",
  description:
    "志望動機 AI を探している就活生向けに、就活Pass の志望動機作成機能の 6 要素スロット、会話ありモード（材料整理 / 深掘り補強）、会話なしの直接生成、料金をまとめました。",
  path: "/shiboudouki-ai",
  keywords: [
    "志望動機 AI",
    "志望動機 作成 AI",
    "志望動機 書き方 AI",
    "志望動機 テンプレ",
    "志望動機 整理",
    "就活Pass",
  ],
});

export default function ShiboudoukiAiPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] text-slate-900 bg-white overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={SHIBOUDOUKI_AI_PAGE_FAQS} />

        <ShiboudoukiAiHeroSection />

        <ShiboudoukiAiPainPointsSection />

        <ShiboudoukiAiFeatureSlotsSection />

        <ShiboudoukiAiFeatureModeSection />

        <ShiboudoukiAiFeatureDraftSection />

        <MidCTASection
          title="志望動機 AI を、無料で試す"
          description="カード登録不要。Free プランの月 50 クレジットから試せます。"
          primaryCta={{ label: "無料で試す", href: "/login" }}
        />

        <FAQSection faqs={SHIBOUDOUKI_AI_PAGE_FAQS} />

        <FinalCTASection
          title={<>志望動機を、AI と一緒に仕上げる。</>}
          description="6 要素を会話で整理し、300 / 400 / 500 字の ES 下書きまで。企業固有の志望動機を、あなたの言葉で。"
          primaryCta={{ label: "無料で志望動機 AI を試す", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
