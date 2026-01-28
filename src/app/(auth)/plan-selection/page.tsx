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
  features: { text: string; included: boolean }[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: "¥0",
    description: "まずは無料で始めたい方に",
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
    features: [
      { text: "企業登録 30社まで", included: true },
      { text: "ESエディタ", included: true },
      { text: "AI添削 月10回", included: true },
      { text: "ガクチカ深掘り 月5回", included: true },
      { text: "カレンダー連携", included: true },
      { text: "テンプレ閲覧", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "¥2,980",
    period: "月",
    description: "最大限のサポートが欲しい方に",
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

export default function PlanSelectionPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
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
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push("/login");
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">プランを選択</h1>
        <p className="text-muted-foreground">
          あなたの就活スタイルに合ったプランをお選びください
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {PLANS.map((plan) => (
          <PlanSelectionCard
            key={plan.id}
            name={plan.name}
            price={plan.price}
            period={plan.period}
            description={plan.description}
            features={plan.features}
            isPopular={plan.isPopular}
            isSelected={selectedPlan === plan.id}
            onSelect={() => setSelectedPlan(plan.id)}
            disabled={isSubmitting}
          />
        ))}
      </div>

      {error && (
        <div className="text-center text-destructive text-sm mb-4">{error}</div>
      )}

      <div className="text-center">
        <Button
          onClick={handleSubmit}
          disabled={!selectedPlan || isSubmitting}
          size="lg"
          className="min-w-[200px]"
        >
          {isSubmitting ? (
            <>
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
              処理中...
            </>
          ) : (
            "このプランで始める"
          )}
        </Button>
        <p className="mt-4 text-xs text-muted-foreground">
          有料プランは後からいつでも変更・キャンセルできます
        </p>
      </div>
    </div>
  );
}
