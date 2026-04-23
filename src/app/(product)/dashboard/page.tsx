import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import type { RequestIdentity } from "@/app/api/_shared/request-identity";
import {
  getActivationData,
  getCompaniesPageData,
  getDashboardIncompleteData,
  getEsStats,
  getUpcomingDeadlinesData,
  getTodayTaskData,
  getViewerPlan,
} from "@/lib/server/app-loaders";
import { getTasksPageData } from "@/lib/server/task-loaders";
import { safeLoad } from "@/lib/server/safe-loader";
import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

function getCompanyLimitText(plan: "guest" | "free" | "standard" | "pro") {
  if (plan === "guest") return "最大3社まで";
  if (plan === "free") return "最大5社まで";
  return "無制限";
}

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const [session, identity] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    getHeadersIdentity(requestHeaders),
  ]);

  if (!identity) {
    return (
      <DashboardPageClient
        viewer={{
          displayName: session?.user?.name || "ゲスト",
          isGuest: !session?.user,
          companyLimitText: "最大3社まで",
        }}
      />
    );
  }

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardAuthenticatedContent
        identity={identity}
        displayName={session?.user?.name || "ゲスト"}
        isGuest={!session?.user}
      />
    </Suspense>
  );
}

async function DashboardAuthenticatedContent({
  identity,
  displayName,
  isGuest,
}: {
  identity: RequestIdentity;
  displayName: string;
  isGuest: boolean;
}) {
  const [
    planResult,
    companiesResult,
    esStatsResult,
    deadlinesResult,
    todayTaskResult,
    activationResult,
    incompleteResult,
    openTasksResult,
  ] = await Promise.all([
    safeLoad("plan", () => getViewerPlan(identity)),
    safeLoad("companies", () => getCompaniesPageData(identity)),
    safeLoad("esStats", () => getEsStats(identity)),
    safeLoad("deadlines", () => getUpcomingDeadlinesData(identity, 7)),
    safeLoad("todayTask", () => getTodayTaskData(identity)),
    safeLoad("activation", () => getActivationData(identity)),
    safeLoad("incomplete", () => getDashboardIncompleteData(identity)),
    safeLoad("openTasks", () => getTasksPageData(identity, { status: "open" })),
  ]);

  const companyLimitText = planResult.data
    ? getCompanyLimitText(planResult.data)
    : companiesResult.data?.limit != null
      ? `最大${companiesResult.data.limit}社まで`
      : "";

  return (
    <DashboardPageClient
      viewer={{
        displayName,
        isGuest,
        companyLimitText,
      }}
      initialCompanies={companiesResult.data ?? undefined}
      initialEsStats={esStatsResult.data ?? undefined}
      initialDeadlines={deadlinesResult.data ?? undefined}
      initialTodayTask={todayTaskResult.data ?? undefined}
      initialActivationData={activationResult.data ?? undefined}
      initialIncompleteItems={incompleteResult.data ?? undefined}
      initialOpenTasks={openTasksResult.data?.tasks ?? undefined}
    />
  );
}
