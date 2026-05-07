"use client";

import { cn } from "@/lib/utils";
import { TaskKanbanCard } from "./TaskKanbanCard";
import type { Task } from "@/hooks/useTasks";

type TaskGroupKey = "overdue" | "today" | "upcoming" | "noDue" | "done";

interface KanbanColumn {
  key: TaskGroupKey;
  label: string;
  emptyLabel: string;
  accentClass: string;
  headerBorderClass: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    key: "overdue",
    label: "期限切れ",
    emptyLabel: "期限切れのタスクはありません",
    accentClass: "text-destructive",
    headerBorderClass: "border-destructive/40",
  },
  {
    key: "today",
    label: "今日まで",
    emptyLabel: "今日のタスクはありません",
    accentClass: "text-primary",
    headerBorderClass: "border-primary/40",
  },
  {
    key: "upcoming",
    label: "今後",
    emptyLabel: "今後のタスクはありません",
    accentClass: "text-muted-foreground",
    headerBorderClass: "border-muted-foreground/30",
  },
  {
    key: "noDue",
    label: "期限なし",
    emptyLabel: "期限なしのタスクはありません",
    accentClass: "text-muted-foreground",
    headerBorderClass: "border-muted-foreground/30",
  },
  {
    key: "done",
    label: "完了",
    emptyLabel: "完了したタスクはありません",
    accentClass: "text-success",
    headerBorderClass: "border-success/40",
  },
];

interface TaskKanbanBoardProps {
  groupedTasks: Record<TaskGroupKey, Task[]>;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
}

export function TaskKanbanBoard({
  groupedTasks,
  onToggleComplete,
  onEditTask,
}: TaskKanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {COLUMNS.map((col) => {
        const items = groupedTasks[col.key] ?? [];
        return (
          <section
            key={col.key}
            className="flex flex-col"
            aria-label={`${col.label}のタスク`}
          >
            {/* Column header */}
            <div
              className={cn(
                "mb-3 flex items-center gap-2 border-b-2 pb-2",
                col.headerBorderClass,
              )}
            >
              <h3
                className={cn("text-sm font-semibold", col.accentClass)}
              >
                {col.label}
              </h3>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium",
                  items.length > 0
                    ? "bg-muted text-muted-foreground"
                    : "bg-transparent text-muted-foreground/50",
                )}
              >
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex flex-1 flex-col gap-2.5">
              {items.length > 0 ? (
                items.map((task) => (
                  <TaskKanbanCard
                    key={task.id}
                    task={task}
                    onToggleComplete={onToggleComplete}
                    onEdit={onEditTask}
                  />
                ))
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/30 p-6">
                  <p className="text-center text-xs text-muted-foreground/60">
                    {col.emptyLabel}
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
