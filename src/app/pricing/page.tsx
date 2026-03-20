"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import { PlanSelectionCard } from "@/components/auth/PlanSelectionCard";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/client";
import { ANNUAL_PLAN_PRICES, type BillingPeriod } from "@/lib/stripe/config";

type PlanType = "free" | "standard" | "pro";

type PricingPlan = {
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
};

function getPlans(period: BillingPeriod): PricingPlan[] {
  const standardPrice = period === "annual" ? `¥${ANNUAL_PLAN_PRICES.standard.toLocaleString("ja-JP")}` : "¥980";
  const proPrice = period === "annual" ? `¥${ANNUAL_PLAN_PRICES.pro.toLocaleString("ja-JP")}` : "¥2,980";

  return [
    {
      id: "free",
      name: "Free",
      price: "¥0",
      description: "まずは無料で試したい方に",
      variant: "default",
      ctaLabel: "無料で始める",
      features: [
        { text: "月30クレジット", included: true, highlight: true },
        { text: "企業登録 5社まで", included: true },
        { text: "ESエディタ", included: true },
        { text: "AI添削（4〜16クレジット/回）", included: true },
        { text: "企業情報取得 1日10回まで無料", included: true },
        { text: "企業RAG取込 月160unitまで無料", included: true },
      ],
    },
    {
      id: "standard",
      name: "Standard",
      price: standardPrice,
      period: period === "annual" ? "年" : "月",
      description: "就活を継続的に進めたい方に",
      isPopular: true,
      variant: "recommended",
      dailyPrice: period === "annual" ? "月あたり約¥832" : "1日約¥33",
      ctaLabel: "Standardで始める",
      features: [
        { text: "月300クレジット", included: true, highlight: true },
        { text: "企業登録 無制限", included: true, highlight: true },
        { text: "ES添削モデルを選択可能", included: true },
        { text: "企業情報取得 1日20回まで無料", included: true },
        { text: "企業RAG取込 月640unitまで無料", included: true, highlight: true },
        { text: "年額は月額合計より約15%お得", included: period === "annual", highlight: period === "annual" },
      ],
    },
    {
      id: "pro",
      name: "Pro",
      price: proPrice,
      period: period === "annual" ? "年" : "月",
      description: "添削や企業研究を重く使いたい方に",
      variant: "premium",
      dailyPrice: period === "annual" ? "月あたり約¥2,483" : "1日約¥99",
      ctaLabel: "Proで始める",
      features: [
        { text: "月1300クレジット", included: true, highlight: true },
        { text: "企業登録 無制限", included: true },
        { text: "ES添削モデルを選択可能", included: true },
        { text: "企業情報取得 1日40回まで無料", included: true },
        { text: "企業RAG取込 月2400unitまで無料", included: true, highlight: true },
        { text: "年額は月額合計より約15%お得", included: period === "annual", highlight: period === "annual" },
      ],
    },
  ];
}

const pricingFaqSchema = [
  {
    "@type": "Question",
    name: "クレジットとは何ですか？",
    acceptedAnswer: {
      "@type": "Answer",
      text: "AI実行や企業情報取得に使うポイントです。成功時のみ消費され、毎月リセットされます。",
    },
  },
  {
    "@type": "Question",
    name: "企業情報取得はどのくらい無料ですか？",
    acceptedAnswer: {
      "@type": "Answer",
      text: "選考スケジュール取得は各プランに日次無料枠があります。企業RAG取込も月ごとの無料unitがあり、通常の利用では無料枠内で使える設計です。",
    },
  },
  {
    "@type": "Question",
    name: "解約はいつでもできますか？",
    acceptedAnswer: {
      "@type": "Answer",
      text: "はい。Stripeのサブスクリプションを通じていつでも解約できます。解約後の扱いは決済画面とアプリ内表示に従います。",
    },
  },
] as const;

const ShieldCheckIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
);

const CreditCardIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>
);

const RefreshIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  const router = useRouter();
  const { isAuthenticated, isLoading, userPlan } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>("standard");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plans = useMemo(() => getPlans(billingPeriod), [billingPeriod]);

  useEffect(() => {
    trackEvent("pricing_view");
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const savedPlan = localStorage.getItem("selectedPlan") as PlanType | null;
    const savedPeriod = (localStorage.getItem("selectedPlanPeriod") || "monthly") as BillingPeriod;
    if (!savedPlan || savedPlan === "free") return;

    localStorage.removeItem("selectedPlan");
    localStorage.removeItem("selectedPlanPeriod");
    setBillingPeriod(savedPeriod);
    void handleCheckout(savedPlan, savedPeriod);
  }, [isAuthenticated, isLoading]);

  const handlePlanSelect = async (planId: PlanType) => {
    setSelectedPlan(planId);

    if (planId === "free") {
      if (!isAuthenticated) {
        router.push("/login?redirect=/dashboard");
      } else {
        router.push("/dashboard");
      }
      return;
    }

    if (!isAuthenticated) {
      localStorage.setItem("selectedPlan", planId);
      localStorage.setItem("selectedPlanPeriod", billingPeriod);
      trackEvent("checkout_intent_login", { plan: planId, period: billingPeriod });
      router.push("/login?redirect=/pricing");
      return;
    }

    await handleCheckout(planId, billingPeriod);
  };

  const handleCheckout = async (plan: PlanType, period: BillingPeriod) => {
    if (plan === "free") return;

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "チェックアウトの作成に失敗しました");
      }

      if (data.url) {
        trackEvent("checkout_start", { plan, period });
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      trackEvent("checkout_error", { plan, period });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold">
            就活Pass
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

      <main className="mx-auto max-w-5xl px-4 py-6">
        {canceled === "true" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-800">
            チェックアウトがキャンセルされました。いつでも再度お試しいただけます。
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-6 text-center">
          <h1 className="mb-2 bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-2xl font-black tracking-tight md:text-3xl">
            就活AI・ES添削AIの料金プラン
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-primary">いつでも変更・キャンセル可能</span>
            <span className="mx-2 text-border">|</span>
            <span className="inline-flex items-center gap-1">おすすめ: Standard</span>
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            就活Pass は、就活AI、ES添削AI、志望動機AI、締切管理をまとめて使いたい方向けの就活アプリです。
            企業情報取得は無料枠を厚くしつつ、添削や対話は利用量に応じて Standard / Pro に切り替えられます。
          </p>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="inline-flex rounded-full border bg-background p-1">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                billingPeriod === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              月額
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod("annual")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                billingPeriod === "annual"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              年額
            </button>
          </div>
        </div>

        <p className="mb-6 text-center text-sm text-muted-foreground">
          年額は月額合計より約15%お得です。クレジットは月ごとに付与されます。
        </p>

        {isAuthenticated && userPlan?.plan && (
          <div className="mb-4 text-center">
            <p className="text-sm text-muted-foreground">
              現在のプラン: <span className="font-semibold text-foreground">{userPlan.plan.toUpperCase()}</span>
            </p>
          </div>
        )}

        <div className="mb-4 grid gap-6 md:grid-cols-3 md:items-end">
          {plans.map((plan, index) => (
            <div key={`${plan.id}-${billingPeriod}`} className={plan.variant === "recommended" ? "md:z-10 md:scale-105" : ""}>
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
                onSelect={() => void handlePlanSelect(plan.id)}
                disabled={isSubmitting}
                animationDelay={index * 100}
                ctaLabel={plan.ctaLabel}
                compact
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
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

        <section className="mt-10 rounded-2xl border bg-background/70 p-6">
          <h2 className="text-lg font-bold text-foreground">比較ポイント</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <p className="font-medium text-foreground">Free</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                まずは ES添削AI や企業情報取得の使い勝手を試したい方向け。無料枠だけでもかなり触れます。
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Standard</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                ES添削と企業管理を継続利用したい方向け。企業情報取得の無料枠が厚く、日常利用の中心プランです。
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Pro</p>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                添削回数や企業研究量が多く、就活AIを重く使いたい方向け。企業RAGの無料取込量も大きく広げています。
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto mt-10 max-w-3xl">
          <h2 className="mb-4 text-lg font-bold">よくある質問</h2>
          <div className="space-y-3">
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">クレジットとは何ですか？</summary>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                AI実行や企業情報取得に使うポイントです。クレジットは
                <span className="font-medium text-foreground">成功時のみ消費</span>
                され、毎月リセットされます。
              </p>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">AI添削は何回できますか？</summary>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                文章の長さと選ぶモデルによって消費クレジットが変わります。目安は 1 回あたり 2〜8 クレジットです。
              </p>
              <div className="mt-3 text-sm leading-6 text-muted-foreground">
                <p className="font-medium text-foreground">ES添削の目安</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>節約モード: 2〜4クレジット</li>
                  <li>高品質モード: 5〜8クレジット</li>
                </ul>
              </div>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">企業情報取得は高くないですか？</summary>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                選考スケジュール取得は日次無料枠を大きく確保しています。企業RAG取込も URL 数や PDF ページ数に応じた軽い unit 制で、
                月次無料枠を超えた分だけ低単価で消費されます。
              </p>
            </details>
            <details className="rounded-lg border bg-background/70 p-4">
              <summary className="cursor-pointer font-medium">解約はいつでもできますか？</summary>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                はい。Stripe のサブスクリプションをいつでも解約できます。解約後の扱いは決済画面とアプリ内表示に従います。
              </p>
            </details>
          </div>
        </section>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="#faq" className="text-primary hover:underline">
            よくある質問
          </Link>
          <span className="mx-1.5">|</span>
          <Link href="/contact" className="text-primary hover:underline">
            お問い合わせ
          </Link>
        </p>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: pricingFaqSchema,
            }),
          }}
        />
      </main>
    </div>
  );
}
