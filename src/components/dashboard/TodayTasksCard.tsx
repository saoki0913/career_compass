"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TASK_TYPE_LABELS, type Task, type TaskType, type TodayTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { AlertTriangle, Calendar, Flag, Plus, Star } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const taskTypeBadgeStyles: Record<TaskType, { bg: string; text: string }> = {
  es: { bg: "bg-blue-100", text: "text-blue-700" },
  web_test: { bg: "bg-purple-100", text: "text-purple-700" },
  self_analysis: { bg: "bg-emerald-100", text: "text-emerald-700" },
  gakuchika: { bg: "bg-emerald-100", text: "text-emerald-700" },
  video: { bg: "bg-pink-100", text: "text-pink-700" },
  other: { bg: "bg-gray-100", text: "text-gray-700" },
};

// ---------------------------------------------------------------------------
// JST daysLeft helper
// ---------------------------------------------------------------------------

function getJSTDaysLeft(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const jstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const jstDue = new Date(due.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  jstNow.setHours(0, 0, 0, 0);
  jstDue.setHours(0, 0, 0, 0);
  return Math.ceil((jstDue.getTime() - jstNow.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

type PriorityLevel = "high" | "medium" | "low";

function getPriority(daysLeft: number | null): PriorityLevel {
  if (daysLeft === null) return "low";
  if (daysLeft <= 1) return "high";
  if (daysLeft <= 3) return "medium";
  return "low";
}

function PriorityDot({ priority }: { priority: PriorityLevel }) {
  return (
    <span className="flex items-center gap-0.5">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          priority === "high" && "bg-red-500",
          priority === "medium" && "bg-orange-500",
          priority === "low" && "border border-muted-foreground/40"
        )}
      />
      <span
        className={cn(
          "text-[10px] font-medium",
          priority === "high" && "text-red-600",
          priority === "medium" && "text-orange-600",
          priority === "low" && "text-muted-foreground"
        )}
      >
        {priority === "high" ? "高" : priority === "medium" ? "中" : "低"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Display item
// ---------------------------------------------------------------------------

type DisplayItem = { item: Task; daysLeft: number | null };

// ---------------------------------------------------------------------------
// Deadline-text formatting
// ---------------------------------------------------------------------------

function formatDeadlineText(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft < 0) return `${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return "本日中";
  const due = new Date();
  due.setDate(due.getDate() + daysLeft);
  return `${due.getMonth() + 1}月${due.getDate()}日まで`;
}

function isUrgentDeadline(daysLeft: number | null): boolean {
  return daysLeft !== null && daysLeft <= 1;
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  label,
  count,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: "red" | "blue";
}) {
  const textColor = color === "red" ? "text-red-600" : "text-blue-600";
  const badgeBg = color === "red" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700";

  return (
    <div className="flex items-center gap-2 py-2">
      <span className={cn("shrink-0", textColor)}>{icon}</span>
      <span className={cn("text-sm font-semibold", textColor)}>{label}</span>
      <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", badgeBg)}>
        {count}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function ItemRow({
  displayItem,
  onToggle,
}: {
  displayItem: DisplayItem;
  onToggle?: (taskId: string) => void;
}) {
  const { daysLeft } = displayItem;

  const title = displayItem.item.title;
  const companyName = displayItem.item.company?.name ?? displayItem.item.application?.name ?? null;
  const type: TaskType = displayItem.item.type;
  const priority = getPriority(daysLeft);
  const deadlineText = formatDeadlineText(daysLeft);
  const urgent = isUrgentDeadline(daysLeft);
  const canToggle = Boolean(onToggle);

  return (
    <div className="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/30">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onToggle) {
            void onToggle(displayItem.item.id);
          }
        }}
        disabled={!canToggle}
        className={cn(
          "h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
          canToggle
            ? "border-muted-foreground/40 hover:bg-primary/10 cursor-pointer"
            : "border-muted-foreground/20 cursor-default"
        )}
        title={canToggle ? "完了にする" : undefined}
        aria-label={`${title}を完了にする`}
      />

      <div className="min-w-0 flex-1">
        <Link
          href="/tasks"
          className="text-sm font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          <span className="line-clamp-1">{title}</span>
        </Link>
        {companyName && (
          <p className="truncate text-xs text-muted-foreground">{companyName}</p>
        )}
      </div>

      {/* Metadata badges */}
      <div className="flex shrink-0 items-center gap-2">
        {deadlineText && (
          <span
            className={cn(
              "hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline-block",
              urgent ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
            )}
          >
            {deadlineText}
          </span>
        )}
        <span
          className={cn(
            "hidden rounded px-1.5 py-0.5 text-[10px] font-medium sm:inline-block",
            taskTypeBadgeStyles[type].bg,
            taskTypeBadgeStyles[type].text
          )}
        >
          {TASK_TYPE_LABELS[type]}
        </span>
        <PriorityDot priority={priority} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TodayTasksCardProps {
  todayTask: TodayTask & {
    isLoading: boolean;
    markComplete: () => Promise<boolean>;
  };
  openTasks: Task[];
  maxOpenTasks?: number;
  onCompleteTodayTask?: () => Promise<boolean>;
  onToggleTask?: (taskId: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TodayTasksCard({
  todayTask,
  openTasks,
  maxOpenTasks = 5,
  onCompleteTodayTask,
  onToggleTask,
}: TodayTasksCardProps) {
  // Resolve daysLeft for the today-task
  const todayTaskDueRaw =
    todayTask.task?.dueDate ?? todayTask.task?.deadline?.dueDate ?? null;
  const todayTaskDaysLeft = getJSTDaysLeft(todayTaskDueRaw);

  // Build grouped display lists
  const { dueTodayItems, thisWeekItems, laterItems } = useMemo(() => {
    const todayTaskId = todayTask.task?.id ?? null;

    const enriched: DisplayItem[] = openTasks
      .filter((t) => t.id !== todayTaskId)
      .map((t) => {
        const raw = t.dueDate ?? t.deadline?.dueDate ?? null;
        return { item: t, daysLeft: getJSTDaysLeft(raw) };
      });

    const dueToday: DisplayItem[] = [];
    const thisWeek: DisplayItem[] = [];
    const later: DisplayItem[] = [];

    for (const di of enriched) {
      if (di.daysLeft !== null && di.daysLeft <= 0) {
        dueToday.push(di);
      } else if (di.daysLeft !== null && di.daysLeft > 0 && di.daysLeft <= 7) {
        thisWeek.push(di);
      } else {
        later.push(di);
      }
    }

    const sortByDaysLeft = (a: DisplayItem, b: DisplayItem) =>
      (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    dueToday.sort(sortByDaysLeft);
    thisWeek.sort(sortByDaysLeft);
    later.sort(sortByDaysLeft);

    return {
      dueTodayItems: dueToday,
      thisWeekItems: thisWeek.slice(0, maxOpenTasks),
      laterItems: later.slice(0, maxOpenTasks),
    };
  }, [openTasks, todayTask.task?.id, maxOpenTasks]);

  const hasTodayTask = !!todayTask.task;
  const hasDueToday = dueTodayItems.length > 0;
  const hasThisWeek = thisWeekItems.length > 0;
  const hasLater = laterItems.length > 0;
  const hasAnyContent = hasTodayTask || hasDueToday || hasThisWeek || hasLater;
  const completeTodayTask = onCompleteTodayTask ?? todayTask.markComplete;

  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5" data-testid="dashboard-today-task-card">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 lg:px-5">
        <CardTitle className="text-lg">今日のタスク</CardTitle>
        <Link
          href="/tasks"
          className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          すべて
        </Link>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-5">
        {!hasAnyContent ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 py-3 text-center">
            <Image
              src="/dashboard/assets/image_09.png"
              alt=""
              width={1254}
              height={1254}
              className="h-24 w-24 object-contain"
            />
            <h3 className="mt-1 text-sm font-semibold">未完了のタスクはありません</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">タスク一覧で追加すると、ここに表示されます</p>
            <Link href="/tasks" className="mt-2 text-xs font-semibold text-primary hover:text-primary/80">
              タスク一覧を開く
            </Link>
          </div>
        ) : (
          <div className="space-y-0.5">
            {/* ---------- Section 1: Top Priority ---------- */}
            {hasTodayTask && todayTask.task && (
              <>
                <SectionHeader
                  icon={<Flag className="h-4 w-4" />}
                  label="最優先"
                  count={1}
                  color="red"
                />
                <div className="group rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start gap-2.5">
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => void completeTodayTask()}
                      className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/40 transition-colors hover:bg-primary/10"
                      title="完了にする"
                      aria-label={`${todayTask.task.title}を完了にする`}
                    />

                    {/* Body */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1 text-primary">
                        <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                        <span className="text-xs font-medium">
                          今日の最重要タスク
                          {todayTask.mode === "DEEP_DIVE" && " · 深掘り"}
                        </span>
                      </div>

                      <Link
                        href="/tasks"
                        className="text-sm font-medium leading-snug hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                      >
                        <p className="line-clamp-1">{todayTask.task.title}</p>
                      </Link>

                      {todayTask.task.company && (
                        <p className="truncate text-xs text-muted-foreground">
                          {todayTask.task.company.name}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Type badge */}
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px] font-medium",
                            taskTypeBadgeStyles[todayTask.task.type].bg,
                            taskTypeBadgeStyles[todayTask.task.type].text
                          )}
                        >
                          {TASK_TYPE_LABELS[todayTask.task.type]}
                        </span>

                        {/* Deadline badge */}
                        {todayTaskDaysLeft !== null && (
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              isUrgentDeadline(todayTaskDaysLeft)
                                ? "bg-red-100 text-red-700"
                                : "bg-orange-100 text-orange-700"
                            )}
                          >
                            {formatDeadlineText(todayTaskDaysLeft)}
                          </span>
                        )}

                        {/* Priority */}
                        <PriorityDot priority={getPriority(todayTaskDaysLeft)} />
                      </div>
                    </div>

                  </div>
                </div>
              </>
            )}

            {/* ---------- Section 2: Due Today ---------- */}
            {hasDueToday && (
              <>
                {hasTodayTask && <div className="h-px bg-border/50 my-1" />}
                <SectionHeader
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label="今日中"
                  count={dueTodayItems.length}
                  color="red"
                />
                <div className="space-y-0.5">
                  {dueTodayItems.map((di) => (
                    <ItemRow
                      key={di.item.id}
                      displayItem={di}
                      onToggle={onToggleTask}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ---------- Section 3: This Week ---------- */}
            {hasThisWeek && (
              <>
                {(hasTodayTask || hasDueToday) && (
                  <div className="h-px bg-border/50 my-1" />
                )}
                <SectionHeader
                  icon={<Calendar className="h-4 w-4" />}
                  label="今週"
                  count={thisWeekItems.length}
                  color="blue"
                />
                <div className="space-y-0.5">
                  {thisWeekItems.map((di) => (
                    <ItemRow
                      key={di.item.id}
                      displayItem={di}
                      onToggle={onToggleTask}
                    />
                  ))}
                </div>
              </>
            )}

            {hasLater && (
              <>
                {(hasTodayTask || hasDueToday || hasThisWeek) && (
                  <div className="h-px bg-border/50 my-1" />
                )}
                <SectionHeader
                  icon={<Calendar className="h-4 w-4" />}
                  label="その他"
                  count={laterItems.length}
                  color="blue"
                />
                <div className="space-y-0.5">
                  {laterItems.map((di) => (
                    <ItemRow
                      key={di.item.id}
                      displayItem={di}
                      onToggle={onToggleTask}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ---------- Add task link ---------- */}
            <Link
              href="/tasks"
              className="flex items-center gap-1 pt-2 text-sm text-primary transition-colors hover:text-primary/80"
            >
              <Plus className="h-4 w-4" />
              <span>タスクを追加</span>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
