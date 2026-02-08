"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  DashboardHeader,
  StatsCard,
  EmptyState,
  QuickActions,
  DeadlineList,
} from "@/components/dashboard";
import { IncompleteTasksCard } from "@/components/dashboard/IncompleteTasksCard";
import { CompanySelectModal } from "@/components/dashboard/CompanySelectModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCompanies } from "@/hooks/useCompanies";
import { useDeadlines } from "@/hooks/useDeadlines";
import { useTodayTask, TASK_TYPE_LABELS } from "@/hooks/useTasks";
import { useEsStats } from "@/hooks/useDocuments";
import { getStatusConfig, type CompanyStatus } from "@/lib/constants/status";
import { cn } from "@/lib/utils";
import { FeatureTour } from "@/components/onboarding/FeatureTour";

// Icons
const CreditIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
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

const CheckCircleIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
    />
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

/**
 * Get status bar color based on company status category
 * Uses semantic colors for quick visual recognition
 */
function getStatusBarColor(status: CompanyStatus): string {
  const config = getStatusConfig(status);
  switch (config.category) {
    case "not_started":
      return "bg-slate-400";
    case "in_progress":
      // Differentiate ES/Test vs Interview stages
      if (status.includes("interview") || status === "final_interview") {
        return "bg-purple-500";
      }
      return "bg-blue-500";
    case "completed":
      // Differentiate positive vs negative outcomes
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

// Base quick actions (without onClick handlers)
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

// Map deadline type to Japanese
const deadlineTypeLabels: Record<string, string> = {
  es_submission: "ES提出",
  interview: "面接",
  test: "テスト",
  offer_response: "内定返答",
  other: "その他",
};

export default function DashboardPage() {
  const { user, isGuest, isLoading, isAuthenticated, userPlan } = useAuth();
  const router = useRouter();
  const [showCompanySelect, setShowCompanySelect] = useState(false);

  // Fetch real data
  const { companies, count: companyCount, limit: companyLimit } = useCompanies();
  const { draftCount, publishedCount, total: esTotal } = useEsStats();
  const { deadlines, count: deadlineCount } = useDeadlines(7);
  const todayTask = useTodayTask();

  // Build quick actions with onClick handler for motivation
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

  // Check if plan selection or onboarding is needed
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      if (userPlan?.needsPlanSelection) {
        router.push("/pricing");
      } else if (userPlan?.needsOnboarding) {
        router.push("/onboarding");
      }
    }
  }, [isLoading, isAuthenticated, userPlan, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-8 w-64 bg-muted rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted rounded-2xl" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const displayName = user?.name || "ゲスト";
  const greeting = getGreeting();

  // Format deadlines for DeadlineList
  const formattedDeadlines = deadlines.slice(0, 5).map((d) => ({
    id: d.id,
    company: d.company,
    type: deadlineTypeLabels[d.type] || d.type,
    date: new Date(d.dueDate),
    daysLeft: d.daysLeft,
  }));

  // Get company limit text
  const getCompanyLimitText = () => {
    if (isGuest) return "最大3社まで";
    if (userPlan?.plan === "free") return "最大5社まで";
    return "無制限";
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting}、{displayName}さん
            </h1>
            {isGuest && (
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                ゲストモードで利用中
              </span>
            )}
          </div>
          <p className="mt-1 text-muted-foreground">
            今日も就活を一歩前へ進めましょう
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
          <StatsCard
            title="登録企業"
            value={companyCount}
            subtitle={getCompanyLimitText()}
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

        {/* Today's Most Important Task */}
        {todayTask.task && (
          <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <StarIcon />
                  <span className="text-sm font-medium">
                    今日の最重要タスク
                    {todayTask.mode === "DEADLINE" && " - 締切優先モード"}
                    {todayTask.mode === "DEEP_DIVE" && " - 深掘りモード"}
                  </span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/tasks">タスク一覧</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => todayTask.markComplete()}
                  className="w-6 h-6 mt-0.5 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0 hover:bg-primary/10 transition-colors"
                  title="完了にする"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {TASK_TYPE_LABELS[todayTask.task.type]}
                    </span>
                    {todayTask.task.company && (
                      <Link
                        href={`/companies/${todayTask.task.company.id}`}
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                      >
                        <CompanyIcon />
                        {todayTask.task.company.name}
                      </Link>
                    )}
                  </div>
                  <p className="font-medium text-lg mt-1">{todayTask.task.title}</p>
                  {todayTask.task.deadline && (
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
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

        {/* Action Zone - 3 Column Grid */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">クイックアクション</h2>
          <QuickActions actions={quickActions}>
            {/* Incomplete Tasks - same size as quick actions */}
            <IncompleteTasksCard variant="quickAction" />
          </QuickActions>
        </section>

        {/* Company Select Modal */}
        <CompanySelectModal
          open={showCompanySelect}
          onOpenChange={setShowCompanySelect}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Companies Section */}
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">登録企業</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/companies">
                  すべて見る
                </Link>
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
                        className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/30 transition-all group"
                      >
                        {/* Status color bar */}
                        <div className={cn("w-1 h-10 rounded-full shrink-0", getStatusBarColor(company.status))} />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{company.name}</p>
                            {/* Status badge */}
                            <span className={cn("text-xs px-1.5 py-0.5 rounded shrink-0", statusConfig.bgColor, statusConfig.color)}>
                              {statusConfig.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {company.industry && <span className="truncate">{company.industry}</span>}
                            {company.nearestDeadline && (
                              <>
                                {company.industry && <span>•</span>}
                                <span className={cn(
                                  "shrink-0",
                                  company.nearestDeadline.daysLeft <= 3 && "text-red-500 font-medium"
                                )}>
                                  {company.nearestDeadline.daysLeft}日後 締切
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Hover chevron */}
                        <ChevronRightIcon className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </Link>
                    );
                  })}
                  {companyCount > 3 && (
                    <Link
                      href="/companies"
                      className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground pt-2 transition-colors"
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
                  action={{
                    label: "企業を追加する",
                    href: "/companies/new",
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Deadlines Section */}
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">近日の締切</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/calendar">
                  カレンダー
                </Link>
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
                  action={{
                    label: "企業を追加する",
                    href: "/companies/new",
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Guest Banner */}
        {isGuest && (
          <div className="mt-8 rounded-2xl bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 p-6 border border-primary/20">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold">ゲストモードで利用中</h3>
                <p className="text-sm text-muted-foreground mt-1">
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

      {/* Feature Tour */}
      <FeatureTour />
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}
