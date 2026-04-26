"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useMemo } from "react";
import { CompanyProgressCard } from "@/components/dashboard/CompanyListCard";
import { DeadlineCard } from "@/components/dashboard/DeadlineCard";
import { WeeklyScheduleView, getWeekDays } from "@/components/dashboard/WeeklyScheduleView";
import { TodayTasksCard } from "@/components/dashboard/TodayTasksCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Button } from "@/components/ui/button";
import { useCompanies, type Company } from "@/hooks/useCompanies";
import { useDeadlines, type Deadline } from "@/hooks/useDeadlines";
import { useCalendarEvents } from "@/hooks/useCalendar";
import { useTasks, useTodayTask, type Task, type TodayTask } from "@/hooks/useTasks";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

const CompanySelectModal = dynamic(() =>
  import("@/components/dashboard/CompanySelectModal").then((mod) => mod.CompanySelectModal)
);

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}

type DashboardPageClientProps = {
  viewer: { displayName: string; isGuest: boolean; companyLimitText: string };
  initialCompanies?: { companies: Company[]; count: number; limit: number | null; canAddMore: boolean };
  initialDeadlines?: { deadlines: Deadline[]; count: number; periodDays: number };
  initialTodayTask?: TodayTask;
  initialOpenTasks?: Task[];
};

export function DashboardPageClient({
  viewer, initialCompanies, initialDeadlines,
  initialTodayTask, initialOpenTasks,
}: DashboardPageClientProps) {
  const [showInterviewCompanySelect, setShowInterviewCompanySelect] = useState(false);
  const [showMotivationCompanySelect, setShowMotivationCompanySelect] = useState(false);
  const { companies, isLoading: companiesLoading } = useCompanies(initialCompanies ? { initialData: initialCompanies } : {});
  const { deadlines, isLoading: deadlinesLoading } = useDeadlines(7, initialDeadlines ? { initialData: initialDeadlines } : {});
  const todayTask = useTodayTask(initialTodayTask ? { initialData: initialTodayTask } : {});
  const { tasks: openTasks, isLoading: openTasksLoading } = useTasks(initialOpenTasks !== undefined ? { status: "open", initialData: initialOpenTasks } : { status: "open" });

  const weekDays = useMemo(() => getWeekDays(), []);
  const weekStart = weekDays[0].toISOString();
  const weekEnd = weekDays[6].toISOString();
  const { events: calendarEvents } = useCalendarEvents({
    start: weekStart,
    end: weekEnd,
    enabled: !viewer.isGuest,
  });

  const scheduleDeadlines = useMemo(() => deadlines.map((d) => ({ id: d.id, companyId: d.companyId, company: d.company, type: d.type, title: d.title, dueDate: d.dueDate, daysLeft: d.daysLeft })), [deadlines]);

  if (!initialCompanies && companiesLoading && deadlinesLoading && todayTask.isLoading && (initialOpenTasks === undefined ? openTasksLoading : false)) {
    return <DashboardSkeleton />;
  }

  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-1 sm:px-6 lg:px-8 flex flex-col gap-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">{greeting}、{viewer.displayName}さん</h1>
            {viewer.isGuest && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">ゲスト</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">今日も就活を一歩前へ進めましょう</p>
        </div>

        <QuickActions
          onInterviewClick={() => setShowInterviewCompanySelect(true)}
          onMotivationClick={() => setShowMotivationCompanySelect(true)}
        />

        <div className="grid grid-cols-1 gap-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:items-start">
          <WeeklyScheduleView deadlines={scheduleDeadlines} calendarEvents={viewer.isGuest ? [] : calendarEvents} isGuest={viewer.isGuest} />
          <TodayTasksCard todayTask={todayTask} openTasks={openTasks} />
        </div>

        <div className="grid grid-cols-1 gap-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:items-start">
          <CompanyProgressCard companies={companies} />
          <DeadlineCard deadlines={deadlines} />
        </div>

        {viewer.isGuest && (
          <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">ゲストモードで利用中</h3>
                <p className="text-xs text-muted-foreground">ログインすると、データの保存やカレンダー連携が使えます</p>
              </div>
              <Button size="sm" className="shrink-0" asChild><Link href="/login">ログインする</Link></Button>
            </div>
          </div>
        )}

        <CompanySelectModal open={showInterviewCompanySelect} onOpenChange={setShowInterviewCompanySelect} mode="interview" />
        <CompanySelectModal open={showMotivationCompanySelect} onOpenChange={setShowMotivationCompanySelect} mode="motivation" />
      </main>
    </div>
  );
}
