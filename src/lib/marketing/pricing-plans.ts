import { ANNUAL_PLAN_PRICES, type BillingPeriod } from "@/lib/billing/plan-metadata";

export type MarketingPricingPlan = {
  id: "free" | "standard" | "pro";
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  isPopular?: boolean;
  dailyPrice?: string;
  originalPrice?: string;
  savingsNote?: string;
};

/** JSON-LD・料金表示の単一ソース（月額・税込み想定のマーケ表記） */
export const MARKETING_STANDARD_MONTHLY_JPY = 1_490;
export const MARKETING_PRO_MONTHLY_JPY = 2_980;

export function getMarketingPricingPlans(
  period: BillingPeriod
): MarketingPricingPlan[] {
  const isAnnual = period === "annual";
  const stdAnnual = ANNUAL_PLAN_PRICES.standard;
  const proAnnual = ANNUAL_PLAN_PRICES.pro;
  const stdMonthlyEquiv = Math.round(stdAnnual / 12);
  const proMonthlyEquiv = Math.round(proAnnual / 12);
  const stdSavings = MARKETING_STANDARD_MONTHLY_JPY * 12 - stdAnnual;
  const proSavings = MARKETING_PRO_MONTHLY_JPY * 12 - proAnnual;

  const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

  return [
    {
      id: "free",
      name: "Free",
      price: "¥0",
      description: "基本機能を試したい方に",
      ctaLabel: "無料で始める",
      features: [
        "月50クレジット",
        "ESエディタ",
        "AI添削",
        "面接対策",
        "ガクチカ深掘り",
        "企業管理",
      ],
    },
    {
      id: "standard",
      name: "Standard",
      price: isAnnual ? fmt(stdAnnual) : fmt(MARKETING_STANDARD_MONTHLY_JPY),
      period: isAnnual ? "年" : "月",
      description: "就活を継続的に進めたい方に",
      isPopular: true,
      dailyPrice: isAnnual
        ? `月あたり約${fmt(stdMonthlyEquiv)}`
        : "1日わずか¥49",
      originalPrice: isAnnual ? fmt(MARKETING_STANDARD_MONTHLY_JPY) : undefined,
      savingsNote: isAnnual ? `${fmt(stdSavings)}お得` : undefined,
      ctaLabel: "Standardで始める",
      features: [
        "月350クレジット",
        "全8スタイルでES添削",
        "面接対策",
        "ガクチカ深掘り",
        "企業管理 無制限",
        "AIモデル選択（Claude / GPT / Gemini）",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: isAnnual ? fmt(proAnnual) : fmt(MARKETING_PRO_MONTHLY_JPY),
      period: isAnnual ? "年" : "月",
      description: "添削や企業研究を重く使いたい方に",
      dailyPrice: isAnnual
        ? `月あたり約${fmt(proMonthlyEquiv)}`
        : "1日わずか¥99",
      originalPrice: isAnnual ? fmt(MARKETING_PRO_MONTHLY_JPY) : undefined,
      savingsNote: isAnnual ? `${fmt(proSavings)}お得` : undefined,
      ctaLabel: "Proで始める",
      features: [
        "月750クレジット",
        "全8スタイルでES添削",
        "面接対策",
        "ガクチカ深掘り",
        "企業管理 無制限",
        "AIモデル選択（Claude / GPT / Gemini）",
      ],
    },
  ];
}
