"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { FaqJsonLd } from "@/components/seo/FaqJsonLd";
import type { MarketingFaq } from "@/lib/marketing/landing-faqs";
import { trackEvent } from "@/lib/analytics/client";
import { getPricingSelectionAction } from "@/lib/billing/pricing-flow";
import { getCheckoutAbandonState } from "@/lib/billing/url-state";
import {
  getMarketingPricingPlans,
  type MarketingPricingPlan,
} from "@/lib/marketing/pricing-plans";
import { ANNUAL_PLAN_PRICES, type BillingPeriod } from "@/lib/stripe/config";
import { cn } from "@/lib/utils";
import { getUserFacingErrorMessage } from "@/lib/api-errors";

type PlanType = "free" | "standard" | "pro";

const PRO_MONTHLY = 2_980;

const comparisonRows: {
  label: string;
  free: string | boolean;
  standard: string | boolean;
  pro: string | boolean;
}[] = [
  { label: "月次クレジット", free: "30", standard: "100", pro: "300" },
  { label: "企業登録", free: "5社まで", standard: "無制限", pro: "無制限" },
  { label: "ES添削スタイル", free: "3種", standard: "全8種", pro: "全8種" },
  { label: "面接対策", free: "GPT-5.4 mini・最終講評成功時 6CR", standard: "GPT-5.4 mini・最終講評成功時 6CR", pro: "GPT-5.4 mini・最終講評成功時 6CR" },
  { label: "ガクチカ素材", free: "3件", standard: "10件", pro: "20件" },
  { label: "企業情報取得（日次無料枠）", free: "1回", standard: "5回", pro: "20回" },
  { label: "選考スケジュール（月次無料）", free: "5回", standard: "50回", pro: "150回" },
  { label: "企業RAG取込（月次無料枠・ページ）", free: "10", standard: "100", pro: "300" },
  { label: "1社あたりRAGソース数", free: "3", standard: "100", pro: "500" },
  { label: "セクション添削", free: false, standard: true, pro: true },
  {
    label: "ES添削モデル",
    free: "GPT-5.4 mini 固定（消費クレジットは有料のプレミアム帯と同じ目安）",
    standard: "選択可（Claude / GPT / Gemini 等）",
    pro: "選択可（Claude / GPT / Gemini 等）",
  },
];

const faqItems: readonly MarketingFaq[] = [
  {
    question: "クレジットとは何ですか？",
    answer:
      "AI実行や企業情報取得に使うポイントです。クレジットは成功時のみ消費され、毎月リセットされます。",
  },
  {
    question: "AI添削は何回できますか？",
    answer:
      "文章の長さとプラン・モデルで消費クレジットが変わります。Free は GPT-5.4 mini 固定で 6〜20 クレジット/回（有料で選べるプレミアムモデルと同じ目安）です。有料プランでは低コスト 3〜12、Claude / GPT / Gemini で 6〜20 が目安です。",
  },
  {
    question: "面接対策は何回できますか？",
    answer:
      "企業特化の模擬面接は GPT-5.4 mini 固定で、最終講評が成功した時に 6 クレジット消費します。月次無料枠はありません。",
  },
  {
    question: "解約はいつでもできますか？",
    answer:
      "はい。Stripeのサブスクリプションをいつでも解約できます。解約後も課金期間の終了まで有料機能をご利用いただけます。",
  },
  {
    question: "無料プランからの切り替えはデータを引き継げますか？",
    answer:
      "はい。プラン変更時にデータはそのまま引き継がれます。企業情報、ES、締切などすべてのデータが維持されます。",
  },
  {
    question: "使い切れなかったクレジットは翌月に繰り越せますか？",
    answer:
      "クレジットは毎月リセットされ、繰り越しはありません。ただし、成功時のみ消費されるため無駄になることはありません。",
  },
];

function ComparisonValue({
  value,
  emphasis = false,
}: {
  value: string | boolean;
  emphasis?: boolean;
}) {
  if (typeof value === "boolean") {
    return value ? (
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full border",
          emphasis
            ? "border-primary/20 bg-primary/10 text-primary"
            : "border-primary/20 bg-primary/10 text-primary"
        )}
      >
        <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </span>
    ) : (
      <span className="text-sm font-medium text-slate-300">-</span>
    );
  }

  return (
    <span
      className={cn(
        "text-sm font-medium tracking-[-0.01em]",
        emphasis ? "text-slate-950" : "text-slate-600"
      )}
    >
      {value}
    </span>
  );
}

function getCurrentPlan(plan: string | null | undefined): PlanType | null {
  if (!plan) return null;
  const normalized = plan.toLowerCase();
  return normalized === "free" || normalized === "standard" || normalized === "pro"
    ? normalized
    : null;
}

function PricingPlanCard({
  plan,
  billingPeriod,
  selectedPlan,
  currentPlan,
  isBusy,
  onSelect,
}: {
  plan: MarketingPricingPlan;
  billingPeriod: BillingPeriod;
  selectedPlan: PlanType | null;
  currentPlan: PlanType | null;
  isBusy: boolean;
  onSelect: (plan: PlanType) => void;
}) {
  const isRecommended = plan.id === "standard";
  const isSelected = selectedPlan === plan.id;
  const isCurrent = currentPlan === plan.id;
  const isAnnual = billingPeriod === "annual";

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-white p-6 shadow-sm transition-colors duration-200",
        isRecommended ? "border-primary/40 bg-primary/[0.02]" : "border-slate-200",
        isSelected && "ring-2 ring-primary/25",
        isCurrent && "border-primary/35"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.16em] uppercase",
                isRecommended
                  ? "bg-primary text-primary-foreground shadow-[0_14px_30px_-18px_rgba(37,99,235,0.5)]"
                  : "border border-slate-200 bg-white text-slate-600"
              )}
            >
              {plan.name}
            </span>
            {isRecommended ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                最も選ばれています
              </span>
            ) : null}
            {isCurrent ? (
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                現在利用中
              </span>
            ) : null}
          </div>
          <div>
            <p className="text-sm leading-6 text-slate-600">{plan.description}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-end gap-2">
        <span className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
          {plan.price}
        </span>
        {plan.period ? (
          <span className="pb-1 text-sm text-slate-500">/{plan.period}</span>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {plan.originalPrice ? (
          <p className="text-slate-500">
            <span className="line-through">{plan.originalPrice}/月</span>
            {plan.savingsNote ? (
              <span className="ml-2 font-semibold text-primary">{plan.savingsNote}</span>
            ) : null}
          </p>
        ) : null}
        {plan.dailyPrice ? (
          <p className="font-medium text-slate-700">{plan.dailyPrice}</p>
        ) : null}
        {!isAnnual && plan.id === "free" ? (
          <p className="text-slate-500">カード不要で始められます</p>
        ) : null}
      </div>

      <ul className="mt-8 space-y-3 border-t border-slate-200/80 pt-6">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm text-slate-700">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950/[0.04] text-slate-700">
              <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Button
          size="lg"
          className={cn(
            "w-full justify-between rounded-2xl text-sm font-semibold",
            isRecommended
              ? "border border-primary/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] text-white"
              : undefined
          )}
          disabled={isBusy}
          onClick={() => onSelect(plan.id)}
        >
          <span>{isCurrent ? "プランを確認する" : plan.ctaLabel}</span>
          {isBusy && isSelected ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </Button>
      </div>
    </article>
  );
}

export default function PricingPage() {
  return (
    <Suspense>
      <PricingPageContent />
    </Suspense>
  );
}

function PricingPageContent() {
  const searchParams = useSearchParams();
  const { canceled } = getCheckoutAbandonState(searchParams);
  const router = useRouter();
  const { isAuthenticated, isLoading, userPlan } = useAuth();
  const [isRoutePending, startTransition] = useTransition();

  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>("standard");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = getCurrentPlan(userPlan?.plan);
  const isBusy = isSubmitting || isRoutePending;
  const source = searchParams.get("source") || "pricing";
  const reason = searchParams.get("reason") || undefined;

  const plans = useMemo(() => getMarketingPricingPlans(billingPeriod), [billingPeriod]);
  const maxSavings = `¥${(PRO_MONTHLY * 12 - ANNUAL_PLAN_PRICES.pro).toLocaleString("ja-JP")}`;

  useEffect(() => {
    trackEvent("pricing_view", { source, reason });
  }, [reason, source]);

  useEffect(() => {
    if (!canceled) return;
    trackEvent("checkout_abandon", {
      source,
      reason,
    });
  }, [canceled, reason, source]);

  const handleCheckout = useCallback(async (plan: PlanType, period: BillingPeriod) => {
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
        trackEvent("checkout_start", { plan, period, source, reason });
        window.location.href = data.url;
      }
    } catch (checkoutError) {
      console.error("Checkout error:", checkoutError);
      setError(getUserFacingErrorMessage(checkoutError, {
        code: "STRIPE_CHECKOUT_CREATE_FAILED",
        userMessage: "プラン変更を開始できませんでした。",
      }, "PricingPage:checkout"));
      trackEvent("checkout_error", { plan, period, source, reason });
    } finally {
      setIsSubmitting(false);
    }
  }, [reason, source]);

  const openBillingPortal = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "請求管理ページを開けませんでした");
      }
      trackEvent("portal_opened", { source: "pricing", currentPlan: currentPlan ?? "unknown" });
      window.location.href = data.url;
    } catch (portalError) {
      setError(getUserFacingErrorMessage(portalError, {
        code: "STRIPE_PORTAL_CREATE_FAILED",
        userMessage: "請求管理ページを開けませんでした。",
      }, "PricingPage:openBillingPortal"));
    } finally {
      setIsSubmitting(false);
    }
  }, [currentPlan]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const savedPlan = localStorage.getItem("selectedPlan") as PlanType | null;
    const savedPeriod = (localStorage.getItem("selectedPlanPeriod") || "monthly") as BillingPeriod;
    if (!savedPlan || savedPlan === "free") return;

    localStorage.removeItem("selectedPlan");
    localStorage.removeItem("selectedPlanPeriod");
    setBillingPeriod(savedPeriod);
    void handleCheckout(savedPlan, savedPeriod);
  }, [handleCheckout, isAuthenticated, isLoading]);

  const handlePlanSelect = useCallback(async (planId: PlanType) => {
    setSelectedPlan(planId);
    const action = getPricingSelectionAction({
      currentPlan,
      targetPlan: planId,
      isAuthenticated,
    });

    if (action === "dashboard") {
      startTransition(() => {
        router.push("/dashboard");
      });
      return;
    }

    if (action === "free") {
      startTransition(() => {
        router.push(isAuthenticated ? "/dashboard" : "/login?redirect=/dashboard");
      });
      return;
    }

    if (action === "login") {
      localStorage.setItem("selectedPlan", planId);
      localStorage.setItem("selectedPlanPeriod", billingPeriod);
      trackEvent("checkout_intent_login", { plan: planId, period: billingPeriod });
      startTransition(() => {
        router.push("/login?redirect=/pricing");
      });
      return;
    }

    if (action === "portal") {
      await openBillingPortal();
      return;
    }

    await handleCheckout(planId, billingPeriod);
  }, [
    billingPeriod,
    currentPlan,
    handleCheckout,
    isAuthenticated,
    openBillingPortal,
    router,
    startTransition,
  ]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,oklch(0.995_0.002_245),oklch(0.986_0.005_245))]">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-primary/[0.07] blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[110px]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/84 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/icon.png"
              alt="就活Pass"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-2xl object-cover"
              priority
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-slate-950">就活Pass</p>
              <p className="text-xs text-slate-500">Pricing</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard" className="inline-flex items-center gap-1.5">
                  ダッシュボード
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">ログイン</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/login" className="inline-flex items-center gap-1.5">
                    無料で始める
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-6 md:pb-12 md:pt-6">
        {canceled ? (
          <div className="mb-6 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-800">
            チェックアウトがキャンセルされました。プラン内容を見直してから、いつでも再開できます。
          </div>
        ) : null}
        {error ? (
          <div className="mb-6 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-800">
            {error}
          </div>
        ) : null}

        <section className="mb-6 border-b border-slate-200/80 pb-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-center text-lg font-semibold tracking-tight text-slate-950 sm:text-left sm:text-xl">
              就活の進行量に合わせて、無理のないプランを選べます。
            </h1>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <p className="text-center text-xs text-slate-600 sm:text-right">
                年額は最大<span className="font-semibold text-slate-950">{maxSavings}</span>お得
              </p>
              <div className="inline-flex self-center rounded-full border border-slate-200 bg-slate-50/80 p-0.5 sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBillingPeriod("monthly")}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                    billingPeriod === "monthly"
                      ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.6)]"
                      : "text-slate-500 hover:text-slate-950"
                  )}
                >
                  月額
                </button>
                <button
                  type="button"
                  onClick={() => setBillingPeriod("annual")}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
                    billingPeriod === "annual"
                      ? "bg-slate-950 text-white shadow-[0_14px_28px_-22px_rgba(15,23,42,0.6)]"
                      : "text-slate-500 hover:text-slate-950"
                  )}
                >
                  年額
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <div className="grid gap-5 lg:grid-cols-3 lg:items-stretch">
            {plans.map((plan) => (
              <PricingPlanCard
                key={`${plan.id}-${billingPeriod}`}
                plan={plan}
                billingPeriod={billingPeriod}
                selectedPlan={selectedPlan}
                currentPlan={currentPlan}
                isBusy={isBusy}
                onSelect={(planId) => void handlePlanSelect(planId)}
              />
            ))}
          </div>
        </section>

        <section className="mb-8 border-t border-slate-200/80 pt-6">
          <p className="text-xs font-medium text-slate-500">プラン選びの目安</p>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
            まずは Free で触り、継続なら Standard、添削・企業研究・面接対策を多く使うなら Pro。成功時のみクレジット消費・いつでも変更可能・有料は
            Stripe 決済です。
          </p>
          <div className="mt-4 grid gap-3 border border-slate-200/80 bg-slate-50/50 px-3 py-3 sm:px-4 md:grid-cols-3">
            <div className="flex min-w-0 items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">成功時のみ消費</p>
                <p className="text-[11px] leading-snug text-slate-600">失敗時は減りません。</p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">変更・解約</p>
                <p className="text-[11px] leading-snug text-slate-600">後から見直せます。</p>
              </div>
            </div>
            <div className="flex min-w-0 items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">Stripe</p>
                <p className="text-[11px] leading-snug text-slate-600">安全に管理。</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-600">
            {isAuthenticated && currentPlan ? (
              <>
                現在のプラン: <span className="font-semibold text-slate-950">{currentPlan.toUpperCase()}</span>
              </>
            ) : (
              <>ログインすると現在のプランをここに表示します。</>
            )}
          </p>
        </section>

        <section className="mt-10 border border-slate-200/80 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">プラン比較</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            下表は就活Pass の実装どおりの制限値です。上部カードの説明と数字が異なる場合は、表を優先してください。
          </p>
          <div className="mt-5 rounded-lg border border-slate-200/80 md:hidden">
            <div className="divide-y divide-slate-200">
              {comparisonRows.map((row) => (
                <div key={row.label} className="space-y-3 px-4 py-4">
                  <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                  <div className="grid gap-2">
                    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Free</p>
                      <div className="mt-2">
                        <ComparisonValue value={row.free} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Standard</p>
                      <div className="mt-2">
                        <ComparisonValue value={row.standard} emphasis />
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Pro</p>
                      <div className="mt-2">
                        <ComparisonValue value={row.pro} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5 hidden overflow-x-auto rounded-lg border border-slate-200/80 md:block">
            <div className="min-w-[min(100%,520px)]">
              <div className="grid grid-cols-[minmax(8rem,1.5fr)_repeat(3,minmax(0,1fr))] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-600 sm:px-4 sm:text-sm">
                <span>項目</span>
                <span className="text-center">Free</span>
                <span className="text-center text-slate-950">Standard</span>
                <span className="text-center">Pro</span>
              </div>
              <div className="divide-y divide-slate-200">
                {comparisonRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[minmax(8rem,1.5fr)_repeat(3,minmax(0,1fr))] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5"
                  >
                    <div className="text-xs font-medium leading-snug text-slate-700 sm:text-sm sm:leading-6">
                      {row.label}
                    </div>
                    <div className="flex justify-center">
                      <ComparisonValue value={row.free} />
                    </div>
                    <div className="flex justify-center rounded-lg bg-primary/[0.06] px-2 py-1.5 sm:px-3 sm:py-2">
                      <ComparisonValue value={row.standard} emphasis />
                    </div>
                    <div className="flex justify-center">
                      <ComparisonValue value={row.pro} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.98))] p-6 text-white shadow-[0_34px_90px_-56px_rgba(15,23,42,0.72)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase">
                Start small
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                迷ったら Free で始めて、必要になった時に切り替えてください。
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                Free は月30クレジット・企業5社まで・ES添削3種・ガクチカ3件・面接対策は GPT-5.4 mini 固定で最終講評成功時 6 クレジット。Standard（¥1,480/月・100CR）は1クレジット約15円、Pro（¥2,980/月・300CR）は約10円の目安です。
              </p>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="border-slate-600 bg-white/8 text-white hover:bg-white/12 hover:text-white"
              asChild
            >
              <Link href="/contact" className="inline-flex items-center gap-2">
                相談する
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>

        <section id="faq" className="mt-8 rounded-[30px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_30px_72px_-52px_rgba(15,23,42,0.3)] sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold text-slate-950">FAQ</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
              料金まわりで迷いやすい点を先にまとめています。
            </h2>
          </div>
          <div className="divide-y divide-slate-200/80 rounded-[24px] border border-slate-200/80 bg-slate-50/80">
            {faqItems.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  <span>{item.question}</span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="px-5 pb-5 text-sm leading-7 text-slate-600">{item.answer}</div>
              </details>
            ))}
          </div>
          <p className="mt-5 text-center text-sm text-slate-500">
            さらに確認したい場合は
            <Link href="/contact" className="mx-1 font-medium text-primary hover:underline">
              お問い合わせ
            </Link>
            から連絡できます。
          </p>
        </section>

        <FaqJsonLd faqs={faqItems} />
      </main>
    </div>
  );
}
