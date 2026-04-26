"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { TASK_TYPE_LABELS, type Task, type TaskType, type TodayTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

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

const EmptyTasksIcon = () => (
  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg className={cn("w-4 h-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const CompanyIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const taskTypeBarColors: Record<TaskType, string> = {
  es: "bg-blue-500",
  web_test: "bg-purple-500",
  self_analysis: "bg-emerald-500",
  gakuchika: "bg-amber-500",
  video: "bg-pink-500",
  other: "bg-slate-400",
};

const taskTypeBadgeStyles: Record<TaskType, { bg: string; text: string }> = {
  es: { bg: "bg-blue-100", text: "text-blue-700" },
  web_test: { bg: "bg-purple-100", text: "text-purple-700" },
  self_analysis: { bg: "bg-emerald-100", text: "text-emerald-700" },
  gakuchika: { bg: "bg-amber-100", text: "text-amber-700" },
  video: { bg: "bg-pink-100", text: "text-pink-700" },
  other: { bg: "bg-gray-100", text: "text-gray-700" },
};

function getOpenTaskDueDaysLeft(task: Task): number | null {
  const raw = task.dueDate ?? task.deadline?.dueDate ?? null;
  if (!raw) return null;
  const due = new Date(raw);
  const now = new Date();
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

interface TodayTasksCardProps {
  todayTask: TodayTask & {
    isLoading: boolean;
    markComplete: () => Promise<boolean>;
  };
  openTasks: Task[];
}

export function TodayTasksCard({ todayTask, openTasks }: TodayTasksCardProps) {
  const hasTodayTask = !!todayTask.task;
  const hasOpenTasks = openTasks.length > 0;
  const showSeparator = hasTodayTask && hasOpenTasks;

  return (
    <Card className="border-border/50 py-2 gap-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">今日のタスク</CardTitle>
        <Button variant="outline" size="sm" asChild>
          <Link href="/tasks">すべて見る</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {hasTodayTask && todayTask.task ? (
          <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 p-3">
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => void todayTask.markComplete()}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-primary transition-colors hover:bg-primary/10"
                title="完了にする"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 items-center gap-1 text-primary">
                  <span className="inline-flex shrink-0 scale-90">
                    <StarIcon />
                  </span>
                  <span className="truncate text-xs font-medium">
                    今日の最重要タスク
                    {todayTask.mode === "DEADLINE" && " · 締切優先"}
                    {todayTask.mode === "DEEP_DIVE" && " · 深掘り"}
                  </span>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                    {TASK_TYPE_LABELS[todayTask.task.type]}
                  </span>
                  {todayTask.task.company && (
                    <Link
                      href={`/companies/${todayTask.task.company.id}`}
                      className="flex min-w-0 items-center gap-0.5 truncate text-muted-foreground hover:text-primary"
                    >
                      <CompanyIcon />
                      <span className="truncate">{todayTask.task.company.name}</span>
                    </Link>
                  )}
                  {todayTask.task.deadline && (
                    <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                      <ClockIcon />
                      {new Date(todayTask.task.deadline.dueDate).toLocaleDateString("ja-JP", {
                        month: "long",
                        day: "numeric",
                      })}
                      まで
                    </span>
                  )}
                </div>
                <p className="truncate text-sm font-medium leading-snug">{todayTask.task.title}</p>
              </div>
            </div>
          </div>
        ) : null}

        {showSeparator && <div className="h-px bg-border/50 my-3" />}

        {hasOpenTasks ? (
          <div className="space-y-1">
            {openTasks.slice(0, 2).map((task) => {
              const badge = taskTypeBadgeStyles[task.type];
              const daysLeft = getOpenTaskDueDaysLeft(task);
              const contextLabel = task.company?.name ?? task.application?.name ?? null;
              return (
                <Link
                  key={task.id}
                  href="/tasks"
                  className="group flex items-center gap-3 rounded-lg border border-transparent p-2.5 transition-all hover:border-border hover:bg-muted/30"
                >
                  <div className={cn("h-8 w-1 shrink-0 rounded-full", taskTypeBarColors[task.type])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                          badge.bg,
                          badge.text
                        )}
                      >
                        {TASK_TYPE_LABELS[task.type]}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      {contextLabel ? <span className="truncate">{contextLabel}</span> : null}
                      {daysLeft !== null ? (
                        <>
                          {contextLabel ? <span className="shrink-0">•</span> : null}
                          <span
                            className={cn(
                              "shrink-0",
                              (daysLeft <= 3 || daysLeft < 0) && "font-medium text-red-500"
                            )}
                          >
                            {daysLeft}日後
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRightIcon className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })}
            {openTasks.length > 2 && (
              <Link
                href="/tasks"
                className="flex items-center justify-center gap-1 pt-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>+{openTasks.length - 2}件</span>
                <ChevronRightIcon className="w-3 h-3" />
              </Link>
            )}
          </div>
        ) : null}

        {!hasTodayTask && !hasOpenTasks ? (
          <EmptyState
            icon={<EmptyTasksIcon />}
            title="未完了のタスクはありません"
            description="タスク一覧で追加すると、ここに表示されます"
            action={{ label: "タスク一覧を開く", href: "/tasks" }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
