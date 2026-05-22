"use client";

import { Building2, CalendarClock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TASK_TYPE_LABELS, type Task } from "@/hooks/useTasks";
import {
  formatDueDate,
  getDaysLeft,
  getDaysLeftColor,
  getDaysLeftLabel,
  taskTypeStyles,
} from "./task-display";

interface TaskKanbanCardProps {
  task: Task;
  onToggleComplete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}

export function TaskKanbanCard({
  task,
  onToggleComplete,
  onEdit,
}: TaskKanbanCardProps) {
  const isCompleted = task.status === "done";
  const daysLeft = getDaysLeft(task.dueDate);
  const colors = taskTypeStyles[task.type];
  const openEditor = () => onEdit(task);

  return (
    <article
      className={cn(
        "group w-full rounded-xl border border-border/55 bg-card p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md xl:p-3",
        isCompleted && "bg-muted/20",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={openEditor}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openEditor();
          }
        }}
        className="block w-full cursor-pointer rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${task.title}を編集`}
      >
        {task.company ? (
          <div className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground xl:mb-1.5 xl:text-xs">
            <Building2 className="h-4 w-4 shrink-0 xl:h-3.5 xl:w-3.5" />
            <span className="truncate">{task.company.name}</span>
          </div>
        ) : null}

        <p
          className={cn(
            "mb-3 text-base font-medium leading-snug line-clamp-2 transition-colors group-hover:text-primary xl:mb-2 xl:text-sm",
            isCompleted && "line-through opacity-70",
          )}
        >
          {task.title}
        </p>

        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              "max-w-[70%] truncate rounded-full border px-2.5 py-1 text-xs font-medium xl:px-2 xl:py-0.5",
              colors.bg,
              colors.text,
              colors.border,
            )}
          >
            {TASK_TYPE_LABELS[task.type]}
          </span>
          <span
            className={cn(
              "shrink-0 text-sm tabular-nums xl:text-xs",
              getDaysLeftColor(daysLeft, task.status),
            )}
          >
            {getDaysLeftLabel(daysLeft, task.status)}
          </span>
        </div>

        {task.dueDate ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground xl:text-xs">
            <CalendarClock className="h-4 w-4 shrink-0 xl:h-3.5 xl:w-3.5" />
            <span>{formatDueDate(task.dueDate)}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-end xl:mt-1">
        <button
          type="button"
          onClick={() => onToggleComplete(task.id)}
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isCompleted
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 hover:border-primary",
          )}
          aria-label={
            isCompleted
              ? `${task.title}を未完了に戻す`
              : `${task.title}を完了にする`
          }
        >
          {isCompleted ? <Check className="h-4 w-4" /> : null}
        </button>
      </div>
    </article>
  );
}
