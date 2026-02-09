"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PlanSelectionCard } from "@/components/auth/PlanSelectionCard";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/client";

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
  ctaLabel?: string;
  features: { text: string; included: boolean; highlight?: boolean }[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: "¥0",
    description: "まずは無料で試してみたい方に",
    variant: "default",
    ctaLabel: "無料で始める",
    features: [
      { text: "月30クレジット", included: true, highlight: true },
      { text: "企業登録 5社まで", included: true },
      { text: "ESエディタ", included: true },
      { text: "AI添削（2〜5クレジット/回）", included: true },
      { text: "添削スタイル 3種", included: true },
      { text: "カレンダー連携（Google/アプリ内）", included: true },
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
    ctaLabel: "Standardで始める",
    features: [
      { text: "月300クレジット", included: true, highlight: true },
      { text: "企業登録 無制限", included: true, highlight: true },
      { text: "ESエディタ", included: true },
      { text: "添削スタイル 8種", included: true, highlight: true },
      { text: "ガクチカ素材 10件まで", included: true },
      { text: "企業RAG 50ページ/社まで", included: true },
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
    ctaLabel: "Proで始める",
    features: [
      { text: "月800クレジット", included: true, highlight: true },
      { text: "企業登録 無制限", included: true },
      { text: "ESエディタ", included: true },
      { text: "添削スタイル 8種", included: true },
      { text: "ガクチカ素材 20件まで", included: true },
      { text: "企業RAG 150ページ/社まで", included: true },
    ],
  },
];

// Icons
const ShieldCheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

const CreditCardIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>
);

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

export default function PricingPage() {
  return (
    <Suspense>
      <PricingPageContent />
    </Suspense>
  );
}

function PricingPageContent() {
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled");

  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>("standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { isAuthenticated, isLoading, userPlan } = useAuth();

  // State for canceled message
  const showCanceledMessage = canceled === "true";

  useEffect(() => {
    trackEvent("pricing_view");
  }, []);

  const handlePlanSelect = async (planId: PlanType) => {
    setSelectedPlan(planId);

    // For free plan, just redirect to signup/login
    if (planId === "free") {
      if (!isAuthenticated) {
        router.push("/login?redirect=/onboarding");
      } else {
        router.push(userPlan?.needsOnboarding ? "/onboarding" : "/dashboard");
      }
      return;
    }

    // For paid plans, redirect to checkout
    if (!isAuthenticated) {
      // Save selected plan to localStorage and redirect to login
      localStorage.setItem("selectedPlan", planId);
      trackEvent("checkout_intent_login", { plan: planId });
      router.push("/login?redirect=/pricing");
      return;
    }

    // User is authenticated, proceed to checkout
    await handleCheckout(planId);
  };

  const handleCheckout = async (plan: PlanType) => {
    if (plan === "free") return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "チェックアウトの作成に失敗しました");
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        trackEvent("checkout_start", { plan });
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      trackEvent("checkout_error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check for saved plan after login
  if (isAuthenticated && !isLoading) {
    const savedPlan = localStorage.getItem("selectedPlan") as PlanType | null;
    if (savedPlan && savedPlan !== "free") {
      localStorage.removeItem("selectedPlan");
      // Auto-trigger checkout for saved plan
      handleCheckout(savedPlan);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            ウカルン
          </Link>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Button variant="outline" asChild>
                <Link href="/dashboard">ダッシュボード</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/login">ログイン</Link>
                </Button>
                <Button asChild>
                  <Link href="/login">無料で始める</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Canceled message */}
        {showCanceledMessage && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-center text-sm animate-in fade-in">
            チェックアウトがキャンセルされました。いつでも再度お試しいただけます。
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-center text-sm animate-in fade-in">
            {error}
          </div>
        )}

        {/* Header section - compact single line */}
        <div className="text-center mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2 bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text">
            あなたに最適なプランを選ぼう
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-medium">いつでも変更・キャンセル可能</span>
            <span className="mx-2 text-border">|</span>
            <span className="inline-flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-primary" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
              おすすめ: Standard
            </span>
          </p>
        </div>

        {/* Current plan indicator for authenticated users */}
        {isAuthenticated && userPlan?.plan && (
          <div className="text-center mb-4 animate-in fade-in">
            <p className="text-sm text-muted-foreground">
              現在のプラン:{" "}
              <span className="font-semibold text-foreground">
                {userPlan.plan.toUpperCase()}
              </span>
            </p>
          </div>
        )}

        {/* Plan cards - center stage effect with Standard scaled up */}
        <div className="grid gap-6 md:gap-6 md:grid-cols-3 md:items-end mb-4">
          {PLANS.map((plan, index) => (
            <div key={plan.id} className={plan.variant === "recommended" ? "md:scale-105 md:z-10" : ""}>
              <PlanSelectionCard
                name={plan.name}
                price={plan.price}
                period={plan.period}
                description={plan.description}
                features={plan.features}
                isPopular={plan.isPopular}
                variant={plan.variant}
                dailyPrice={plan.dailyPrice}
                isSelected={selectedPlan === plan.id}
                onSelect={() => handlePlanSelect(plan.id)}
                disabled={isSubmitting}
                animationDelay={index * 100}
                ctaLabel={plan.ctaLabel}
                compact
              />
            </div>
          ))}
        </div>

        {/* Trust badges - compact single row */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground animate-in fade-in duration-700" style={{ animationDelay: "400ms" }}>
          <div className="flex items-center gap-1.5">
            <ShieldCheckIcon />
            <span>安心のセキュリティ</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <CreditCardIcon />
            <span>Stripe安全決済</span>
          </div>
          <span className="text-border">|</span>
          <div className="flex items-center gap-1.5">
            <RefreshIcon />
            <span>いつでも変更可能</span>
          </div>
        </div>

        {/* FAQ */}
        <section id="faq" className="mt-10 max-w-3xl mx-auto">
          <h2 className="text-lg font-bold mb-4">よくある質問</h2>
          <div className="space-y-3">
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">
                クレジットとは何ですか？
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-6">
                AI実行や企業情報取得などの機能に使うポイントです。クレジットは
                <span className="font-medium text-foreground">成功時のみ消費</span>
                され、毎月リセットされます（繰り越しなし）。
              </p>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">
                AI添削は何回できますか？
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-6">
                文章の長さにより消費クレジットが変わります（目安: 2〜5クレジット/回）。
                実行前に見積が表示されます。
              </p>
              <div className="mt-3 text-sm text-muted-foreground leading-6">
                <p className="font-medium text-foreground">例（ES添削）</p>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  <li>〜800字: 2クレジット</li>
                  <li>801〜1600字: 3クレジット</li>
                  <li>1601〜2400字: 4クレジット</li>
                </ul>
              </div>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">
                ゲストでも利用できますか？
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-6">
                はい。まずはゲストで試せます（企業登録などに上限があります）。Googleカレンダー連携や一部の機能はログインが必要です。
              </p>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">
                解約はいつでもできますか？
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-6">
                はい。Stripeのサブスクリプションをいつでも解約できます。解約後の扱いは決済画面およびアプリ内表示に従います。
              </p>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">
                入力した文章はどのように扱われますか？
              </summary>
              <p className="mt-2 text-sm text-muted-foreground leading-6">
                添削や生成のために外部AIサービスへ送信して処理する場合があります。詳細は
                <Link href="/privacy" className="underline hover:text-foreground">
                  プライバシーポリシー
                </Link>
                をご確認ください。
              </p>
            </details>
          </div>
        </section>

        {/* Footer text + FAQ link */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="#faq" className="text-primary hover:underline">
            よくある質問
          </Link>
          <span className="mx-1.5">|</span>
          <Link href="/contact" className="text-primary hover:underline">
            お問い合わせ
          </Link>
        </p>
      </main>
    </div>
  );
}
