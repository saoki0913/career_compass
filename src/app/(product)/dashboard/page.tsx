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
  const plan = await getViewerPlan(identity);
  const [companiesData, esStats, deadlinesData, todayTaskData, activationData, incompleteItems] =
    await Promise.all([
      getCompaniesPageData(identity),
      getEsStats(identity),
      getUpcomingDeadlinesData(identity, 7),
      getTodayTaskData(identity),
      getActivationData(identity),
      getDashboardIncompleteData(identity),
    ]);

  return (
    <DashboardPageClient
      viewer={{
        displayName,
        isGuest,
        companyLimitText: getCompanyLimitText(plan),
      }}
      initialCompanies={companiesData}
      initialEsStats={esStats}
      initialDeadlines={deadlinesData}
      initialTodayTask={todayTaskData}
      initialActivationData={activationData}
      initialIncompleteItems={incompleteItems}
    />
  );
}
