import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { ES_TENSAKU_AI_PAGE_FAQS } from "@/lib/marketing/es-tensaku-ai-faqs";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import { MidCTASection } from "@/components/landing/MidCTASection";
import { FAQSection } from "@/components/landing/FAQSection";
import { FinalCTASection } from "@/components/landing/FinalCTASection";
import { EsTensakuAiHeroSection } from "@/components/landing/es-tensaku-ai/EsTensakuAiHeroSection";
import { EsTensakuAiPainPointsSection } from "@/components/landing/es-tensaku-ai/EsTensakuAiPainPointsSection";
import { EsTensakuAiFeatureTemplateSection } from "@/components/landing/es-tensaku-ai/EsTensakuAiFeatureTemplateSection";
import { EsTensakuAiFeatureCompanySection } from "@/components/landing/es-tensaku-ai/EsTensakuAiFeatureCompanySection";
import { EsTensakuAiFeatureRewriteSection } from "@/components/landing/es-tensaku-ai/EsTensakuAiFeatureRewriteSection";

export const metadata: Metadata = createMarketingMetadata({
  title: "ES添削AI・ES AI を探している方へ | 就活Pass",
  description:
    "ES添削 AI を探している就活生向けに、就活Pass の設問タイプ別 AI 添削、登録企業の採用ページ情報を自動反映する添削、Free 50 クレジット（約 8 回）で試せる範囲、志望動機 AI・ガクチカ AI・AI 模擬面接へのつなぎ方まで解説します。",
  path: "/es-tensaku-ai",
  keywords: ["ES添削 AI", "ES AI", "ES 添削 AI 無料", "エントリーシート 添削 AI", "就活Pass"],
});

export default function EsTensakuAiPage() {
  return (
    <div
      className="font-['Inter','Noto_Sans_JP',sans-serif] text-slate-900 bg-white overflow-x-hidden"
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <LandingHeader />

      <main>
        <FaqJsonLd faqs={ES_TENSAKU_AI_PAGE_FAQS} />

        <EsTensakuAiHeroSection />

        <EsTensakuAiPainPointsSection />

        <EsTensakuAiFeatureTemplateSection />

        <EsTensakuAiFeatureCompanySection />

        <EsTensakuAiFeatureRewriteSection />

        <MidCTASection
          title="ES添削AIを、無料で試す"
          description="カード登録不要。Free プランの月 50 クレジットから試せます（ES 添削 1 回 = 6〜20 クレジット）。"
          primaryCta={{ label: "無料で試す", href: "/login" }}
        />

        <FAQSection faqs={ES_TENSAKU_AI_PAGE_FAQS} />

        <FinalCTASection
          title={<>設問ごとの添削を、AI と今すぐ。</>}
          description="ESの下書きを貼り付けるだけ。設問タイプに合わせた改善案と、企業情報を反映した書き換え案を提示します。"
          primaryCta={{ label: "無料で ES 添削 AI を試す", href: "/login" }}
        />
      </main>

      <LandingFooter />

      <StickyCTABar />
    </div>
  );
}
