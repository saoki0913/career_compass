"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlanSelectionCard } from "@/components/auth/PlanSelectionCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";

type PlanType = "free" | "standard" | "pro";

const PLANS: {
  id: PlanType;
  name: string;
  price: string;
  period?: string;
  description: string;
  isPopular?: boolean;
  variant: "default" | "recommended" | "premium";
  dailyPrice?: string;
  features: { text: string; included: boolean; highlight?: boolean }[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: "¥0",
    description: "まずは無料で試してみたい方に",
    variant: "default",
    features: [
      { text: "企業登録 5社まで", included: true },
      { text: "ESエディタ", included: true },
      { text: "AI添削 月3回", included: true },
      { text: "ガクチカ深掘り 月1回", included: true },
      { text: "カレンダー連携", included: false },
      { text: "テンプレ閲覧", included: false },
    ],
  },
  {
    id: "standard",
    name: "Standard",
    price: "¥980",
    period: "月",
    description: "本格的に就活を進めたい方に",
    isPopular: true,
    variant: "recommended",
    dailyPrice: "¥33",
    features: [
      { text: "企業登録 30社まで", included: true, highlight: true },
      { text: "ESエディタ", included: true },
      { text: "AI添削 月10回", included: true, highlight: true },
      { text: "ガクチカ深掘り 月5回", included: true, highlight: true },
      { text: "カレンダー連携", included: true },
      { text: "テンプレ閲覧", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "¥2,980",
    period: "月",
    description: "最大限のサポートで内定を勝ち取る",
    variant: "premium",
    dailyPrice: "¥99",
    features: [
      { text: "企業登録 無制限", included: true },
      { text: "ESエディタ", included: true },
      { text: "AI添削 無制限", included: true },
      { text: "ガクチカ深掘り 無制限", included: true },
      { text: "カレンダー連携", included: true },
      { text: "テンプレ閲覧・投稿", included: true },
    ],
  },
];

// Icons
const ShieldCheckIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

const CreditCardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

export default function PlanSelectionPage() {
  // Default Effect: Pre-select the recommended plan
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>("standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isAuthenticated, isLoading, refreshPlan } = useAuth();

  const handleSubmit = async () => {
    if (!selectedPlan) {
      setError("プランを選択してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "プランの選択に失敗しました");
      }

      await refreshPlan();
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push("/login");
    return null;
  }

  return (
    // Break out of parent auth layout's max-w-md constraint
    <div className="fixed inset-0 overflow-auto bg-gradient-to-br from-background to-muted">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* Gradient mesh */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12 min-h-screen flex flex-col justify-center">
        {/* Header section */}
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
            あなたに最適なプランを選ぼう
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            就活の進め方に合わせて、3つのプランからお選びください。
            <br className="hidden sm:block" />
            <span className="text-primary font-medium">いつでも変更・キャンセル可能</span>です。
          </p>
        </div>

        {/* Plan cards - staggered animation */}
        <div className="grid gap-6 md:gap-6 md:grid-cols-3 mb-10">
          {PLANS.map((plan, index) => (
            <PlanSelectionCard
              key={plan.id}
              name={plan.name}
              price={plan.price}
              period={plan.period}
              description={plan.description}
              features={plan.features}
              isPopular={plan.isPopular}
              variant={plan.variant}
              dailyPrice={plan.dailyPrice}
              isSelected={selectedPlan === plan.id}
              onSelect={() => setSelectedPlan(plan.id)}
              disabled={isSubmitting}
              animationDelay={index * 100}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="text-center mb-6 animate-in fade-in">
            <p className="text-destructive text-sm bg-destructive/10 inline-block px-4 py-2 rounded-lg">
              {error}
            </p>
          </div>
        )}

        {/* Submit button */}
        <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: "300ms" }}>
          <Button
            onClick={handleSubmit}
            disabled={!selectedPlan || isSubmitting}
            size="lg"
            className="min-w-[280px] h-14 text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-current" />
                処理中...
              </span>
            ) : (
              "このプランで始める"
            )}
          </Button>
        </div>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground animate-in fade-in duration-700" style={{ animationDelay: "400ms" }}>
          <div className="flex items-center gap-2">
            <ShieldCheckIcon />
            <span>安心のセキュリティ</span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCardIcon />
            <span>クレジットカード不要で開始</span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshIcon />
            <span>いつでもプラン変更可能</span>
          </div>
        </div>

        {/* Additional info */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          有料プランはStripeを通じた安全な決済で処理されます。
          <br />
          ご不明な点がございましたら、お気軽にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
