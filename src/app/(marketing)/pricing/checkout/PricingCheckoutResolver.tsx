"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { restorePricingIntent, type PricingIntent } from "@/lib/billing/pricing-flow";
import { usePricingPlanSelection } from "@/hooks/usePricingPlanSelection";

type CheckoutResolution =
  | { state: "pending" }
  | { state: "missing" }
  | { state: "storage_error" }
  | { state: "selection_failed" };

type RestoredPricingIntent =
  | { ok: true; intent: PricingIntent | null }
  | { ok: false };

function restorePricingIntentSafely(storage: Storage): RestoredPricingIntent {
  try {
    return { ok: true, intent: restorePricingIntent(storage) };
  } catch {
    return { ok: false };
  }
}

export function PricingCheckoutResolver() {
  const attemptedRef = useRef(false);
  const [resolution, setResolution] = useState<CheckoutResolution>({ state: "pending" });
  const { error, isLoading, selectPlan } = usePricingPlanSelection({
    intentSource: "pricing",
    analyticsSource: "pricing-checkout",
  });

  useEffect(() => {
    if (isLoading || attemptedRef.current) return;
    attemptedRef.current = true;

    let cancelled = false;
    const restored = restorePricingIntentSafely(window.sessionStorage);
    if (!restored.ok) {
      queueMicrotask(() => {
        if (!cancelled) setResolution({ state: "storage_error" });
      });
    } else if (!restored.intent) {
      queueMicrotask(() => {
        if (!cancelled) setResolution({ state: "missing" });
      });
    } else {
      const intent = restored.intent;
      void (async () => {
        const selected = await selectPlan(intent.plan, intent.period, {
          intentSource: intent.source,
          analyticsSource: intent.source,
          reason: intent.reason,
        });
        if (!selected && !cancelled) {
          setResolution({ state: "selection_failed" });
        }
      })().catch(() => {
        if (!cancelled) {
          setResolution({ state: "selection_failed" });
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isLoading, selectPlan]);

  const terminalMessage = error
    || (resolution.state === "storage_error"
      ? "ブラウザの保存領域を確認できませんでした。料金ページからもう一度選択してください。"
      : resolution.state === "missing"
        ? "プラン選択の有効期限が切れました。料金ページからもう一度選択してください。"
        : resolution.state === "selection_failed"
          ? "決済画面を開始できませんでした。時間をおいて、もう一度お試しください。"
          : null);
  const isTerminal = Boolean(terminalMessage);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fbff] px-6 py-16">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-7 text-center shadow-[0_18px_42px_rgba(20,50,110,0.12)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {isTerminal ? (
            <AlertCircle className="h-6 w-6" aria-hidden />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          )}
        </div>
        <h1 className="mt-5 text-xl font-semibold text-slate-950">
          {isTerminal ? "プラン選択を確認できませんでした" : "プラン選択を確認しています"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isTerminal
            ? "もう一度プランを選択すると、決済画面へ進めます。"
            : "選択済みのプランを引き継いで、次の画面へ進みます。"}
        </p>
        {terminalMessage ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
            {terminalMessage}
            <div className="mt-3">
              <Link href="/pricing" className="font-semibold text-primary hover:underline">
                料金ページへ戻る
              </Link>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
