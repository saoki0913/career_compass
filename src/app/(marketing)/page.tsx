import type { Metadata } from "next";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import { LANDING_PAGE_FAQS } from "@/lib/marketing/landing-faqs";
import { LandingPage } from "@/components/landing/LandingPage";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { getMarketingDescription } from "@/lib/seo/site-structured-data";

/**
 * LP トップの metadata。
 * タイトルは「便益 + 対象者」型でキーワードを自然に含みつつ Google の title rewrite を避ける。
 * description は SSOT（`getMarketingDescription("/")`）から取得。
 */
export const metadata: Metadata = createMarketingMetadata({
  title: "就活Pass | ES添削・志望動機・AI模擬面接をひとつにまとめる就活AIアプリ（シューパス）",
  description: getMarketingDescription("/"),
  path: "/",
});

export default function Home() {
  return (
    <>
      <FaqJsonLd faqs={LANDING_PAGE_FAQS} />
      <LandingPage />
    </>
  );
}
