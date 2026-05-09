"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TASK_TYPE_LABELS, type Task, type TaskType, type TodayTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

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
// Section header — Linear-style text divider
// ---------------------------------------------------------------------------

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 pb-1 pt-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xs text-muted-foreground/50">{count}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row — flat list item with hover feedback
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
  const deadlineText = formatDeadlineText(daysLeft);
  const urgent = isUrgentDeadline(daysLeft);
  const canToggle = Boolean(onToggle);

  return (
    <div className="group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40 lg:min-h-0 lg:py-2">
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
          "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center lg:min-h-0 lg:min-w-0",
          canToggle ? "cursor-pointer" : "cursor-default"
        )}
        title={canToggle ? "完了にする" : undefined}
        aria-label={`${title}を完了にする`}
      >
        <span className={cn(
          "h-[18px] w-[18px] rounded border transition-colors",
          canToggle ? "border-border hover:border-foreground/40" : "border-border/60"
        )} />
      </button>

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

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline lg:text-[11px]">
          {TASK_TYPE_LABELS[type]}
        </span>
        {deadlineText && (
          <span
            className={cn(
              "text-xs lg:text-[11px]",
              urgent ? "font-medium text-destructive" : "text-muted-foreground"
            )}
          >
            {deadlineText}
          </span>
        )}
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
  const todayTaskDueRaw =
    todayTask.task?.dueDate ?? todayTask.task?.deadline?.dueDate ?? null;
  const todayTaskDaysLeft = getJSTDaysLeft(todayTaskDueRaw);

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

  const todayTaskDeadlineText = formatDeadlineText(todayTaskDaysLeft);
  const todayTaskUrgent = isUrgentDeadline(todayTaskDaysLeft);

  return (
    <Card className="h-full min-h-0 overflow-hidden border-border/50 py-1.5 gap-1.5" data-testid="dashboard-today-task-card">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between px-4 lg:px-5">
        <CardTitle className="text-base font-semibold tracking-tight">今日のタスク</CardTitle>
        <Link
          href="/tasks"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                <SectionHeader label="最優先" count={1} />
                <div className="rounded-lg bg-muted/30 px-3 py-3 lg:py-2.5">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void completeTodayTask()}
                      className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center lg:min-h-0 lg:min-w-0"
                      title="完了にする"
                      aria-label={`${todayTask.task.title}を完了にする`}
                    >
                      <span className="h-[18px] w-[18px] rounded border border-border transition-colors hover:border-foreground/40" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <Link
                        href="/tasks"
                        className="text-sm font-semibold leading-snug hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                      >
                        <p className="line-clamp-1">{todayTask.task.title}</p>
                      </Link>

                      {todayTask.task.company && (
                        <p className="truncate text-xs text-muted-foreground">
                          {todayTask.task.company.name}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline lg:text-[11px]">
                        {TASK_TYPE_LABELS[todayTask.task.type]}
                      </span>
                      {todayTaskDeadlineText && (
                        <span
                          className={cn(
                            "text-xs lg:text-[11px]",
                            todayTaskUrgent ? "font-medium text-destructive" : "text-muted-foreground"
                          )}
                        >
                          {todayTaskDeadlineText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ---------- Section 2: Due Today ---------- */}
            {hasDueToday && (
              <>
                <SectionHeader label="今日中" count={dueTodayItems.length} />
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
                <SectionHeader label="今週" count={thisWeekItems.length} />
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
                <SectionHeader label="その他" count={laterItems.length} />
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
            <div className="pt-3">
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground py-2"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>タスクを追加</span>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
