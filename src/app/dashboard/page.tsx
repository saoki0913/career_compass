"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  DashboardHeader,
  StatsCard,
  EmptyState,
  QuickActions,
  DeadlineList,
} from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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

// Quick action data
const quickActions = [
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
    href: "/es/new",
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

// Sample deadline data (will be replaced with real data)
const sampleDeadlines = [
  {
    id: "1",
    company: "株式会社サンプル",
    type: "ES提出",
    date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    daysLeft: 3,
  },
  {
    id: "2",
    company: "テスト商事",
    type: "一次面接",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    daysLeft: 7,
  },
];

export default function DashboardPage() {
  const { user, isGuest, isLoading, isAuthenticated, userPlan } = useAuth();
  const router = useRouter();

  // Check if plan selection is needed
  useEffect(() => {
    if (!isLoading && isAuthenticated && userPlan?.needsPlanSelection) {
      router.push("/plan-selection");
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
  const planCredits = userPlan?.plan === "pro" ? 800 : userPlan?.plan === "standard" ? 300 : 30;
  const currentCredits = planCredits; // TODO: Get from API

  // For demo, show empty state for new users
  const hasCompanies = false;
  const hasDeadlines = false;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}、{displayName}さん
          </h1>
          <p className="mt-1 text-muted-foreground">
            今日も就活を一歩前へ進めましょう
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatsCard
            title="クレジット残高"
            value={currentCredits}
            subtitle={`月間 ${planCredits} クレジット`}
            icon={<CreditIcon />}
            variant="primary"
          />
          <StatsCard
            title="登録企業"
            value={0}
            subtitle={
              isGuest
                ? "最大3社まで"
                : userPlan?.plan === "free"
                ? "最大5社まで"
                : "無制限"
            }
            icon={<CompanyIcon />}
          />
          <StatsCard
            title="今週の締切"
            value={0}
            subtitle="直近7日間"
            icon={<CalendarIcon />}
          />
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">クイックアクション</h2>
          <QuickActions actions={quickActions} />
        </div>

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
              {hasCompanies ? (
                <div>{/* Company list will go here */}</div>
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
              {hasDeadlines ? (
                <DeadlineList deadlines={sampleDeadlines} />
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
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}
