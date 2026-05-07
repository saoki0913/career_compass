"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useMemo } from "react";
import { CompanyProgressCard } from "@/components/dashboard/CompanyListCard";
import { WeeklyScheduleView, getWeekDays } from "@/components/dashboard/WeeklyScheduleView";
import { TodayTasksCard } from "@/components/dashboard/TodayTasksCard";
import { DeadlineCard } from "@/components/dashboard/DeadlineCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Button } from "@/components/ui/button";
import { useCompanies, type Company } from "@/hooks/useCompanies";
import { useDeadlines, type Deadline } from "@/hooks/useDeadlines";
import { useCalendarEvents, useGoogleCalendar } from "@/hooks/useCalendar";
import { useTasks, useTodayTask, type Task, type TodayTask } from "@/hooks/useTasks";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/SidebarContext";

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
  const [weekOffset, setWeekOffset] = useState(0);
  const { companies, isLoading: companiesLoading } = useCompanies(initialCompanies ? { initialData: initialCompanies } : {});
  const deadlineLookaheadDays = Math.min(30, Math.max(7, 7 + weekOffset * 7));
  const { deadlines, isLoading: deadlinesLoading } = useDeadlines(
    deadlineLookaheadDays,
    initialDeadlines && initialDeadlines.periodDays === deadlineLookaheadDays ? { initialData: initialDeadlines } : {},
  );
  const todayTask = useTodayTask(initialTodayTask ? { initialData: initialTodayTask } : {});
  const {
    tasks: openTasks,
    isLoading: openTasksLoading,
    refresh: refreshOpenTasks,
    toggleComplete,
  } = useTasks(initialOpenTasks !== undefined ? { status: "open", initialData: initialOpenTasks } : { status: "open" });

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekStart = weekDays[0].toISOString();
  const weekEnd = weekDays[6].toISOString();
  const { events: calendarEvents } = useCalendarEvents({
    start: weekStart,
    end: weekEnd,
    enabled: !viewer.isGuest,
  });
  const { isConnected: isCalendarConnected } = useGoogleCalendar();
  const { isCollapsed } = useSidebar();

  const scheduleDeadlines = useMemo(() => deadlines.map((d) => ({ id: d.id, companyId: d.companyId, company: d.company, type: d.type, title: d.title, dueDate: d.dueDate, daysLeft: d.daysLeft })), [deadlines]);
  const handleCompleteTodayTask = async () => {
    const completed = await todayTask.markComplete();
    if (completed) {
      await refreshOpenTasks();
    }
    return completed;
  };

  if (!initialCompanies && companiesLoading && deadlinesLoading && todayTask.isLoading && (initialOpenTasks === undefined ? openTasksLoading : false)) {
    return <DashboardSkeleton />;
  }

  const greeting = getGreeting();

  return (
    <div className="overflow-x-hidden bg-background">
      <main className={cn("mx-auto flex min-h-screen flex-col gap-3 overflow-x-hidden px-4 pb-3 pt-14 transition-[max-width] duration-200 ease-in-out sm:px-6 lg:h-dvh lg:min-h-0 lg:gap-2 lg:overflow-hidden lg:px-5 lg:py-3", isCollapsed ? "max-w-[1440px]" : "max-w-7xl")}>
        <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 xl:flex-nowrap">
          <div className="flex min-w-0 items-baseline gap-x-2 xl:shrink">
            <h1 className="truncate text-lg font-bold tracking-tight">{greeting}、{viewer.displayName}さん</h1>
            {viewer.isGuest && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">ゲスト</span>
            )}
          </div>
          <span className="hidden shrink-0 text-xs text-muted-foreground 2xl:inline">今日も就活を一歩前へ進めましょう</span>
          <QuickActions
            onInterviewClick={() => setShowInterviewCompanySelect(true)}
            onMotivationClick={() => setShowMotivationCompanySelect(true)}
            className="-mx-4 w-[calc(100%+2rem)] px-4 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:mx-0 lg:basis-full lg:px-0 xl:ml-auto xl:mr-0 xl:min-w-0 xl:basis-auto xl:flex-1 xl:justify-end xl:overflow-visible xl:pb-0"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] lg:gap-2 lg:overflow-hidden">
          <div className="flex min-h-0 flex-col gap-3 lg:grid lg:grid-rows-[minmax(0,1.42fr)_minmax(0,1fr)] lg:gap-2 lg:overflow-hidden animate-fade-up">
            <WeeklyScheduleView
              deadlines={scheduleDeadlines}
              calendarEvents={viewer.isGuest ? [] : calendarEvents}
              isGuest={viewer.isGuest}
              isConnected={isCalendarConnected}
              weekDays={weekDays}
              weekOffset={weekOffset}
              onPrevWeek={() => setWeekOffset((o) => o - 1)}
              onNextWeek={() => setWeekOffset((o) => o + 1)}
              onToday={() => setWeekOffset(0)}
            />
            <CompanyProgressCard companies={companies} />
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(220px,0.72fr)] gap-3 lg:gap-2 lg:overflow-hidden animate-fade-up delay-100">
            <TodayTasksCard
              todayTask={todayTask}
              openTasks={openTasks}
              maxOpenTasks={5}
              onCompleteTodayTask={handleCompleteTodayTask}
              onToggleTask={toggleComplete}
            />
            <DeadlineCard deadlines={deadlines} maxVisible={4} />
          </div>
        </div>

        {viewer.isGuest && (
          <div className="shrink-0 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 px-3 py-2 lg:py-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">ゲストモードで利用中</h3>
                <p className="truncate text-xs text-muted-foreground">ログインすると、データの保存やカレンダー連携が使えます</p>
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
