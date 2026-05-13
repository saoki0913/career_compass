import type { Metadata } from "next";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { PricingInteractive } from "./PricingInteractive";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活AI・ES添削AI・AI模擬面接の料金プラン（月¥0から）| 就活Pass",
  description:
    "就活Pass の料金プラン。ES添削AI・志望動機AI・ガクチカAI・AI模擬面接を Free / Standard / Pro で比較。成功時のみクレジット消費、Stripe 決済、いつでも変更・解約可能。",
  path: "/pricing",
  keywords: [
    "就活Pass 料金",
    "就活AI 料金",
    "ES添削 AI 料金",
    "AI 模擬面接 料金",
    "就活アプリ 料金",
    "ES添削 サブスク",
  ],
});

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PricingInteractive />
    </div>
  );
}
