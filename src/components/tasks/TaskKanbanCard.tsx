"use client";

import { Building2, CalendarClock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TASK_TYPE_LABELS, type Task, type TaskType } from "@/hooks/useTasks";

interface TaskKanbanCardProps {
  task: Task;
  onToggleComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}

const typeColors: Record<
  TaskType,
  { bg: string; text: string; border: string }
> = {
  es: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  web_test: {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
  },
  self_analysis: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  gakuchika: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  video: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200",
  },
  other: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
  },
};

function getDaysLeft(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dueDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  return Math.ceil(
    (dueDay.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function getDaysLeftLabel(daysLeft: number | null, status: string): string {
  if (status === "done") return "完了";
  if (daysLeft == null) return "期限なし";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return "今日";
  if (daysLeft === 1) return "明日";
  return `あと${daysLeft}日`;
}

function getDaysLeftColor(daysLeft: number | null, status: string): string {
  if (status === "done") return "text-success";
  if (daysLeft == null) return "text-muted-foreground";
  if (daysLeft < 0) return "text-destructive font-medium";
  if (daysLeft < 3) return "text-destructive";
  if (daysLeft < 7) return "text-warning-foreground";
  return "text-muted-foreground";
}

function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  return date.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
}

export function TaskKanbanCard({
  task,
  onToggleComplete,
  onEdit,
}: TaskKanbanCardProps) {
  const isCompleted = task.status === "done";
  const daysLeft = getDaysLeft(task.dueDate);
  const colors = typeColors[task.type];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(task);
        }
      }}
      className="group block w-full cursor-pointer rounded-xl border border-border/50 bg-card p-3.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* Company name */}
      {task.company ? (
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{task.company.name}</span>
        </div>
      ) : null}

      {/* Title */}
      <p
        className={cn(
          "mb-2 text-sm font-medium leading-snug line-clamp-2 transition-colors group-hover:text-primary",
          isCompleted && "line-through opacity-60",
        )}
      >
        {task.title}
      </p>

      {/* Type badge and days left */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-medium",
            colors.bg,
            colors.text,
            colors.border,
          )}
        >
          {TASK_TYPE_LABELS[task.type]}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            getDaysLeftColor(daysLeft, task.status),
          )}
        >
          {getDaysLeftLabel(daysLeft, task.status)}
        </span>
      </div>

      {/* Due date row */}
      {task.dueDate ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatDueDate(task.dueDate)}</span>
        </div>
      ) : null}

      {/* Complete toggle */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete(task.id);
          }}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
            isCompleted
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary",
          )}
          aria-label={
            isCompleted ? "タスクを未完了に戻す" : "タスクを完了にする"
          }
        >
          {isCompleted ? <Check className="h-3.5 w-3.5" /> : null}
        </button>
      </div>
    </div>
  );
}
