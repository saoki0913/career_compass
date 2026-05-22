"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCredits } from "@/hooks/useCredits";
import { getPurchaseSuccessState } from "@/lib/billing/url-state";
import { notifyPurchaseSuccess } from "@/lib/notifications";
import { QuickActions } from "@/components/dashboard/QuickActions";

const CompanySelectModal = dynamic(() =>
  import("@/components/dashboard/CompanySelectModal").then((mod) => mod.CompanySelectModal)
);

type DashboardViewer = {
  displayName: string;
  isGuest: boolean;
  companyLimitText: string;
};

type DashboardHeaderProps = {
  viewer: DashboardViewer;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function DashboardPurchaseSuccessEffect() {
  const searchParams = useSearchParams();
  const { refreshPlan, isAuthenticated, isReady } = useAuth();
  const { refresh: creditsRefresh } = useCredits({ isAuthenticated, isAuthReady: isReady });
  const purchaseHandled = useRef(false);

  useEffect(() => {
    if (purchaseHandled.current) return;
    const { success, plan } = getPurchaseSuccessState(searchParams);
    if (!success || !plan) return;
    purchaseHandled.current = true;

    (async () => {
      let refreshedPlan = await refreshPlan();
      for (const delayMs of [1200, 2400, 4200]) {
        if (refreshedPlan?.plan === plan) break;
        await wait(delayMs);
        refreshedPlan = await refreshPlan();
      }
      const isPlanConfirmed = refreshedPlan?.plan === plan;
      notifyPurchaseSuccess(plan, isPlanConfirmed);
      await creditsRefresh();
      window.history.replaceState({}, "", "/dashboard");
    })();
  }, [searchParams, refreshPlan, creditsRefresh]);

  return null;
}

export function DashboardHeader({ viewer }: DashboardHeaderProps) {
  const [showInterviewCompanySelect, setShowInterviewCompanySelect] = useState(false);
  const [showMotivationCompanySelect, setShowMotivationCompanySelect] = useState(false);
  const greeting = getGreeting();

  return (
    <div className="flex min-h-9 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-2 xl:flex-nowrap">
      <DashboardPurchaseSuccessEffect />
      <div className="flex min-w-0 items-baseline gap-x-2 pl-14 lg:pl-0 xl:shrink">
        <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl lg:text-lg">
          {greeting}、{viewer.displayName}さん
        </h1>
        {viewer.isGuest && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">ゲスト</span>
        )}
      </div>
      <span className="hidden shrink-0 text-xs text-muted-foreground 2xl:inline">今日も就活を一歩前へ進めましょう</span>
      <QuickActions
        onInterviewClick={() => setShowInterviewCompanySelect(true)}
        onMotivationClick={() => setShowMotivationCompanySelect(true)}
        className="w-full sm:w-full lg:basis-full xl:ml-auto xl:mr-0 xl:min-w-0 xl:basis-auto xl:flex-1 xl:justify-end xl:overflow-visible xl:pb-0"
      />

      {showInterviewCompanySelect && (
        <CompanySelectModal
          open={showInterviewCompanySelect}
          onOpenChange={setShowInterviewCompanySelect}
          mode="interview"
        />
      )}
      {showMotivationCompanySelect && (
        <CompanySelectModal
          open={showMotivationCompanySelect}
          onOpenChange={setShowMotivationCompanySelect}
          mode="motivation"
        />
      )}
    </div>
  );
}
