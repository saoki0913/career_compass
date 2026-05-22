"use client";

import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskKanbanCard } from "./TaskKanbanCard";
import type { Task } from "@/hooks/useTasks";
import { TASK_KANBAN_COLUMNS, type TaskGroupKey } from "./task-display";

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
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5 xl:gap-4">
      {TASK_KANBAN_COLUMNS.map((col) => {
        const items = groupedTasks[col.key] ?? [];
        return (
          <section
            key={col.key}
            className="flex min-w-0 flex-col"
            aria-label={`${col.label}のタスク`}
          >
            <div
              className={cn(
                "mb-3 flex items-center gap-2 border-b-2 pb-3",
                col.headerBorderClass,
              )}
            >
              <h3
                className={cn("text-base font-semibold xl:text-sm", col.accentClass)}
              >
                {col.label}
              </h3>
              <span
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-xs font-medium xl:h-5 xl:min-w-5 xl:px-1.5",
                  items.length > 0
                    ? "bg-muted text-muted-foreground"
                    : "bg-transparent text-muted-foreground/50",
                )}
              >
                {items.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 xl:gap-2.5">
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
                <div className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-slate-50/60 p-6 text-center xl:min-h-72">
                  <Inbox className="mb-3 h-9 w-9 text-muted-foreground/30" aria-hidden="true" />
                  <p className="max-w-36 text-xs leading-5 text-muted-foreground/70">
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
