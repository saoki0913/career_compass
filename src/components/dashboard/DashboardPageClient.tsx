"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { ActivationChecklistCard } from "@/components/dashboard/ActivationChecklistCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DeadlineList } from "@/components/dashboard/DeadlineList";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FirstRunGuideCard } from "@/components/onboarding/FirstRunGuideCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { IncompleteTasksCard } from "@/components/dashboard/IncompleteTasksCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActivation, type ActivationProgress } from "@/hooks/useActivation";
import { useCompanies, type Company } from "@/hooks/useCompanies";
import { useDeadlines, type Deadline } from "@/hooks/useDeadlines";
import { useEsStats } from "@/hooks/useDocuments";
import { type IncompleteItemsData } from "@/hooks/useIncompleteItems";
import { useTodayTask, TASK_TYPE_LABELS, type TodayTask } from "@/hooks/useTasks";
import { getStatusConfig, type CompanyStatus } from "@/lib/constants/status";
import { cn } from "@/lib/utils";

const CompanySelectModal = dynamic(() =>
  import("@/components/dashboard/CompanySelectModal").then((mod) => mod.CompanySelectModal)
);

const CompanyIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const StarIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const EmptyCompanyIcon = () => (
  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const HeartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
    />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={cn("w-4 h-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

function getStatusBarColor(status: CompanyStatus): string {
  const config = getStatusConfig(status);
  switch (config.category) {
    case "not_started":
      return "bg-slate-400";
    case "in_progress":
      if (status.includes("interview") || status === "final_interview") {
        return "bg-purple-500";
      }
      return "bg-blue-500";
    case "completed":
      if (status === "offer" || status.includes("pass")) {
        return "bg-emerald-500";
      }
      if (status.includes("rejected")) {
        return "bg-red-400";
      }
      return "bg-gray-400";
    default:
      return "bg-slate-400";
  }
}

const baseQuickActions = [
  {
    title: "企業を追加",
    description: "新しい企業を登録",
    href: "/companies/new",
    icon: <PlusIcon />,
    color: "indigo" as const,
  },
  {
    title: "ES作成",
    description: "エントリーシートを書く",
    href: "/es?new=1",
    icon: <DocumentIcon />,
    color: "orange" as const,
  },
  {
    title: "AI添削",
    description: "ESをAIがチェック",
    href: "/es?action=review",
    icon: <SparklesIcon />,
    color: "emerald" as const,
  },
  {
    title: "ガクチカ深掘り",
    description: "自己分析を深める",
    href: "/gakuchika",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
    color: "rose" as const,
  },
];

const deadlineTypeLabels: Record<string, string> = {
  es_submission: "ES提出",
  interview: "面接",
  test: "テスト",
  offer_response: "内定返答",
  other: "その他",
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

type DashboardPageClientProps = {
  viewer: {
    displayName: string;
    isGuest: boolean;
    companyLimitText: string;
  };
  initialCompanies?: {
    companies: Company[];
    count: number;
    limit: number | null;
    canAddMore: boolean;
  };
  initialEsStats?: {
    draftCount: number;
    publishedCount: number;
    total: number;
  };
  initialDeadlines?: {
    deadlines: Deadline[];
    count: number;
    periodDays: number;
  };
  initialTodayTask?: TodayTask;
  initialActivationData?: ActivationProgress | null;
  initialIncompleteItems?: IncompleteItemsData | null;
};

export function DashboardPageClient({
  viewer,
  initialCompanies,
  initialEsStats,
  initialDeadlines,
  initialTodayTask,
  initialActivationData,
  initialIncompleteItems,
}: DashboardPageClientProps) {
  const [showCompanySelect, setShowCompanySelect] = useState(false);
  const { companies, count: companyCount, isLoading: companiesLoading } = useCompanies(
    initialCompanies ? { initialData: initialCompanies } : {}
  );
  const { draftCount, publishedCount, total: esTotal, isLoading: esStatsLoading } = useEsStats(
    initialEsStats ? { initialData: initialEsStats } : {}
  );
  const { deadlines, count: deadlineCount, isLoading: deadlinesLoading } = useDeadlines(
    7,
    initialDeadlines ? { initialData: initialDeadlines } : {}
  );
  const todayTask = useTodayTask(initialTodayTask ? { initialData: initialTodayTask } : {});
  const { data: activationData, isLoading: activationLoading } = useActivation(
    initialActivationData !== undefined ? { initialData: initialActivationData } : {}
  );

  if (!initialCompanies && companiesLoading && esStatsLoading && deadlinesLoading && todayTask.isLoading && activationLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="animate-pulse space-y-8">
            <div className="h-8 w-64 rounded-lg bg-muted" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-32 rounded-2xl bg-muted" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const quickActions = [
    ...baseQuickActions,
    {
      title: "AIで志望動機",
      description: "志望動機を作成",
      onClick: () => setShowCompanySelect(true),
      icon: <HeartIcon />,
      color: "sky" as const,
    },
  ];

  const greeting = getGreeting();
  const formattedDeadlines = deadlines.slice(0, 5).map((deadline) => ({
    id: deadline.id,
    company: deadline.company,
    type: deadlineTypeLabels[deadline.type] || deadline.type,
    date: new Date(deadline.dueDate),
    daysLeft: deadline.daysLeft,
  }));
  const shouldShowFirstRunGuide = activationData?.completedSteps === 0;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {greeting}、{viewer.displayName}さん
              </h1>
              {viewer.isGuest && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  ゲストモードで利用中
                </span>
              )}
            </div>
            <p className="mt-1 text-muted-foreground">今日も就活を一歩前へ進めましょう</p>
          </div>

          {todayTask.task && (
            <Card className="w-full flex-shrink-0 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 sm:w-[420px]">
              <CardHeader className="px-4 pb-2 pt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-primary">
                    <StarIcon />
                    <span className="text-xs font-medium">
                      今日の最重要タスク
                      {todayTask.mode === "DEADLINE" && " - 締切優先モード"}
                      {todayTask.mode === "DEEP_DIVE" && " - 深掘りモード"}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
                    <Link href="/tasks">タスク一覧</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => void todayTask.markComplete()}
                    className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 border-primary transition-colors hover:bg-primary/10"
                    title="完了にする"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {TASK_TYPE_LABELS[todayTask.task.type]}
                      </span>
                      {todayTask.task.company && (
                        <Link
                          href={`/companies/${todayTask.task.company.id}`}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <CompanyIcon />
                          {todayTask.task.company.name}
                        </Link>
                      )}
                    </div>
                    <p className="mt-0.5 font-medium">{todayTask.task.title}</p>
                    {todayTask.task.deadline && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <ClockIcon />
                        {new Date(todayTask.task.deadline.dueDate).toLocaleDateString("ja-JP", {
                          month: "long",
                          day: "numeric",
                        })}
                        まで
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <FirstRunGuideCard isVisible={!!shouldShowFirstRunGuide} />

        {activationData && activationData.completedSteps < activationData.totalSteps ? (
          <ActivationChecklistCard progress={activationData} muted={!!shouldShowFirstRunGuide} />
        ) : null}

        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
          <StatsCard
            title="登録企業"
            value={companyCount}
            subtitle={viewer.companyLimitText}
            icon={<CompanyIcon />}
            variant="primary"
            href="/companies"
          />
          <StatsCard
            title="ES作成数"
            value={esTotal}
            subtitle={`完了 ${publishedCount} / 下書き ${draftCount}`}
            icon={<DocumentIcon />}
            href="/es"
          />
          <StatsCard
            title="今週の締切"
            value={deadlineCount}
            subtitle="直近7日間"
            icon={<CalendarIcon />}
            href="/calendar"
            className="col-span-2 lg:col-span-1"
          />
        </div>

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">クイックアクション</h2>
          <QuickActions actions={quickActions}>
            <IncompleteTasksCard variant="quickAction" initialData={initialIncompleteItems} />
          </QuickActions>
        </section>

        <CompanySelectModal open={showCompanySelect} onOpenChange={setShowCompanySelect} />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">登録企業</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/companies">すべて見る</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {companyCount > 0 ? (
                <div className="space-y-2">
                  {companies.slice(0, 3).map((company) => {
                    const statusConfig = getStatusConfig(company.status);
                    return (
                      <Link
                        key={company.id}
                        href={`/companies/${company.id}`}
                        className="group flex items-center gap-3 rounded-lg border border-transparent p-3 transition-all hover:border-border hover:bg-muted/30"
                      >
                        <div className={cn("h-10 w-1 shrink-0 rounded-full", getStatusBarColor(company.status))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{company.name}</p>
                            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs", statusConfig.bgColor, statusConfig.color)}>
                              {statusConfig.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {company.industry && <span className="truncate">{company.industry}</span>}
                            {company.nearestDeadline && (
                              <>
                                {company.industry && <span>•</span>}
                                <span
                                  className={cn(
                                    "shrink-0",
                                    company.nearestDeadline.daysLeft <= 3 && "font-medium text-red-500"
                                  )}
                                >
                                  {company.nearestDeadline.daysLeft}日後 締切
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <ChevronRightIcon className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    );
                  })}
                  {companyCount > 3 && (
                    <Link
                      href="/companies"
                      className="flex items-center justify-center gap-1 pt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span>他 {companyCount - 3} 社を見る</span>
                      <ChevronRightIcon className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<EmptyCompanyIcon />}
                  title="まだ企業が登録されていません"
                  description="志望企業を登録して、ES提出や面接の締切を管理しましょう"
                  action={{ label: "企業を追加する", href: "/companies/new" }}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">近日の締切</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/calendar">カレンダー</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {deadlineCount > 0 ? (
                <DeadlineList deadlines={formattedDeadlines} />
              ) : (
                <EmptyState
                  icon={<CalendarIcon />}
                  title="締切がありません"
                  description="企業を登録すると、ESや面接の締切が自動で抽出されます"
                  action={{ label: "企業を追加する", href: "/companies/new" }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {viewer.isGuest && (
          <div className="mt-8 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">ゲストモードで利用中</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  ログインすると、データの保存やカレンダー連携が使えるようになります
                </p>
              </div>
              <Button asChild>
                <Link href="/login">ログインする</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
