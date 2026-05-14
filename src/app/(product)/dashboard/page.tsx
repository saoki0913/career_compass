import { Suspense } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCurrentRequestIdentity } from "@/lib/server/request-identity-cache";
import {
  getCompaniesPageData,
  getUpcomingDeadlinesData,
  getTodayTaskData,
} from "@/lib/server/app-loaders";
import { getTasksPageData } from "@/lib/server/task-loaders";
import { streamableLoad } from "@/lib/server/streaming-helpers";
import { StreamingErrorBoundary } from "@/components/error/StreamingErrorBoundary";
import { AnimatedSuspenseContent } from "@/components/ui/AnimatedSuspenseContent";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardScheduleZone } from "@/components/dashboard/DashboardScheduleZone";
import { DashboardPipelineZone } from "@/components/dashboard/DashboardPipelineZone";
import { DashboardTasksZone } from "@/components/dashboard/DashboardTasksZone";
import { DashboardDeadlinesZone } from "@/components/dashboard/DashboardDeadlinesZone";
import {
  DashboardDeadlinesSkeleton,
  DashboardPipelineSkeleton,
  DashboardScheduleSkeleton,
  DashboardTasksSkeleton,
} from "@/components/skeletons/DashboardSkeleton";
import type { CompaniesPageData, DeadlinesPageData, TasksPageData, TodayTaskData } from "@/lib/dto/dashboard";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const [session, identity] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    getCurrentRequestIdentity(),
  ]);

  if (!identity) {
    return (
      <DashboardShell
        viewer={{ displayName: session?.user?.name || "ゲスト", isGuest: !session?.user, companyLimitText: "最大3社まで" }}
        header={<DashboardHeader viewer={{ displayName: session?.user?.name || "ゲスト", isGuest: !session?.user, companyLimitText: "最大3社まで" }} />}
        schedule={<DashboardScheduleZone isGuest={!session?.user} />}
        pipeline={<DashboardPipelineZone />}
        tasks={<DashboardTasksZone />}
        deadlines={<DashboardDeadlinesZone />}
      />
    );
  }

  const viewer = {
    displayName: session?.user?.name || "ゲスト",
    isGuest: !session?.user,
    companyLimitText: session?.user ? "" : "最大3社まで",
  };
  const deadlinesPromise = streamableLoad("dashboardDeadlines", () => getUpcomingDeadlinesData(identity, 7));
  const companiesPromise = streamableLoad("dashboardCompanies", () => getCompaniesPageData(identity));
  const todayTaskPromise = streamableLoad("dashboardTodayTask", () => getTodayTaskData(identity));
  const openTasksPromise = streamableLoad("dashboardOpenTasks", () => getTasksPageData(identity, { status: "open" }));

  return (
    <DashboardShell
      viewer={viewer}
      header={<DashboardHeader viewer={viewer} />}
      schedule={
        <StreamingErrorBoundary>
          <Suspense fallback={<DashboardScheduleSkeleton />}>
            <AnimatedSuspenseContent className="h-full min-h-0">
              <DashboardScheduleContent deadlinesPromise={deadlinesPromise} isGuest={viewer.isGuest} />
            </AnimatedSuspenseContent>
          </Suspense>
        </StreamingErrorBoundary>
      }
      pipeline={
        <StreamingErrorBoundary>
          <Suspense fallback={<DashboardPipelineSkeleton />}>
            <AnimatedSuspenseContent className="h-full min-h-0">
              <DashboardPipelineContent companiesPromise={companiesPromise} />
            </AnimatedSuspenseContent>
          </Suspense>
        </StreamingErrorBoundary>
      }
      tasks={
        <StreamingErrorBoundary>
          <Suspense fallback={<DashboardTasksSkeleton />}>
            <AnimatedSuspenseContent className="h-full min-h-0">
              <DashboardTasksContent todayTaskPromise={todayTaskPromise} openTasksPromise={openTasksPromise} />
            </AnimatedSuspenseContent>
          </Suspense>
        </StreamingErrorBoundary>
      }
      deadlines={
        <StreamingErrorBoundary>
          <Suspense fallback={<DashboardDeadlinesSkeleton />}>
            <AnimatedSuspenseContent className="h-full min-h-0">
              <DashboardDeadlinesContent deadlinesPromise={deadlinesPromise} />
            </AnimatedSuspenseContent>
          </Suspense>
        </StreamingErrorBoundary>
      }
    />
  );
}

async function DashboardScheduleContent({
  deadlinesPromise,
  isGuest,
}: {
  deadlinesPromise: Promise<DeadlinesPageData>;
  isGuest: boolean;
}) {
  const deadlines = await deadlinesPromise;
  return <DashboardScheduleZone initialDeadlines={deadlines} isGuest={isGuest} />;
}

async function DashboardPipelineContent({
  companiesPromise,
}: {
  companiesPromise: Promise<CompaniesPageData>;
}) {
  const companies = await companiesPromise;
  return <DashboardPipelineZone initialCompanies={companies} />;
}

async function DashboardTasksContent({
  todayTaskPromise,
  openTasksPromise,
}: {
  todayTaskPromise: Promise<TodayTaskData>;
  openTasksPromise: Promise<TasksPageData>;
}) {
  const [todayTask, openTasks] = await Promise.all([todayTaskPromise, openTasksPromise]);
  return <DashboardTasksZone initialTodayTask={todayTask} initialOpenTasks={openTasks.tasks} />;
}

async function DashboardDeadlinesContent({
  deadlinesPromise,
}: {
  deadlinesPromise: Promise<DeadlinesPageData>;
}) {
  const deadlines = await deadlinesPromise;
  return <DashboardDeadlinesZone initialDeadlines={deadlines} />;
}
