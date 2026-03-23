import { ANNUAL_PLAN_PRICES, type BillingPeriod } from "@/lib/stripe/config";

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

const STANDARD_MONTHLY = 1_480;
const PRO_MONTHLY = 2_980;

export function getMarketingPricingPlans(
  period: BillingPeriod
): MarketingPricingPlan[] {
  const isAnnual = period === "annual";
  const stdAnnual = ANNUAL_PLAN_PRICES.standard;
  const proAnnual = ANNUAL_PLAN_PRICES.pro;
  const stdMonthlyEquiv = Math.round(stdAnnual / 12);
  const proMonthlyEquiv = Math.round(proAnnual / 12);
  const stdSavings = STANDARD_MONTHLY * 12 - stdAnnual;
  const proSavings = PRO_MONTHLY * 12 - proAnnual;

  const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

  return [
    {
      id: "free",
      name: "Free",
      price: "¥0",
      description: "基本機能を試したい方に（月30クレジット）",
      ctaLabel: "無料で始める",
      features: [
        "月30クレジット",
        "企業登録 5社まで",
        "ESエディタ",
        "AI添削（FreeはGPT-5.4 mini固定・クレジットは6〜20/回。課金でモデル選択可）",
        "企業情報取得 1日1回まで無料",
        "選考スケジュール 月5回まで無料",
        "企業RAG取込 月10ページまで無料（1社あたりソース3件まで）",
      ],
    },
    {
      id: "standard",
      name: "Standard",
      price: isAnnual ? fmt(stdAnnual) : fmt(STANDARD_MONTHLY),
      period: isAnnual ? "年" : "月",
      description: "就活を継続的に進めたい方に",
      isPopular: true,
      dailyPrice: isAnnual
        ? `月あたり約${fmt(stdMonthlyEquiv)}`
        : "1日わずか¥49",
      originalPrice: isAnnual ? fmt(STANDARD_MONTHLY) : undefined,
      savingsNote: isAnnual ? `${fmt(stdSavings)}お得` : undefined,
      ctaLabel: "Standardで始める",
      features: [
        "月100クレジット",
        "企業登録 無制限",
        "全8スタイルでES添削",
        "企業情報取得 1日5回まで無料",
        "選考スケジュール 月50回まで無料",
        "企業RAG取込 月100ページまで無料",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: isAnnual ? fmt(proAnnual) : fmt(PRO_MONTHLY),
      period: isAnnual ? "年" : "月",
      description: "添削や企業研究を重く使いたい方に",
      dailyPrice: isAnnual
        ? `月あたり約${fmt(proMonthlyEquiv)}`
        : "1日わずか¥99",
      originalPrice: isAnnual ? fmt(PRO_MONTHLY) : undefined,
      savingsNote: isAnnual ? `${fmt(proSavings)}お得` : undefined,
      ctaLabel: "Proで始める",
      features: [
        "月300クレジット",
        "企業登録 無制限",
        "全8スタイルでES添削",
        "企業情報取得 1日20回まで無料",
        "選考スケジュール 月150回まで無料",
        "企業RAG取込 月300ページまで無料",
      ],
    },
  ];
}
