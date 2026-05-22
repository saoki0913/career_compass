"use client";

import { useState } from "react";
import { Building2, CalendarClock, Loader2, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Task } from "@/hooks/useTasks";

interface TodayPriorityTaskCardProps {
  todayTask: {
    task: Task;
    mode: "DEADLINE" | "DEEP_DIVE" | "";
    markComplete: () => Promise<boolean>;
  };
  onEdit: (task: Task) => void;
}

export function TodayPriorityTaskCard({
  todayTask,
  onEdit,
}: TodayPriorityTaskCardProps) {
  const [isCompleting, setIsCompleting] = useState(false);

  async function handleComplete() {
    if (isCompleting) return;
    setIsCompleting(true);
    try {
      await todayTask.markComplete();
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <Card className="mb-6 overflow-hidden border-primary/25 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),hsl(var(--background))_64%)] gap-0 px-4 py-3 shadow-sm md:px-5 md:py-2">
      <div className="flex min-h-[72px] flex-col gap-3 md:min-h-[56px] md:flex-row md:items-center">
        <div className="flex shrink-0 items-center gap-2 text-primary">
          <Star className="h-5 w-5 fill-current md:h-4 md:w-4" />
          <span className="text-sm font-semibold md:text-xs md:font-medium">
            今日の最重要タスク
            {todayTask.mode === "DEADLINE" && " / 締切優先"}
            {todayTask.mode === "DEEP_DIVE" && " / 深掘り優先"}
          </span>
        </div>

        <div className="hidden h-4 w-px bg-border/50 sm:block" />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => void handleComplete()}
            disabled={isCompleting}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-primary text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 md:h-9 md:w-9"
            aria-label={`${todayTask.task.title}を完了にする`}
          >
            {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          </button>
          <span className="min-w-0 flex-1 truncate text-base font-medium md:text-sm">
            {todayTask.task.title}
          </span>
          {todayTask.task.company && (
            <span className="hidden min-w-0 shrink items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{todayTask.task.company.name}</span>
            </span>
          )}
          {todayTask.task.deadline && (
            <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:inline-flex">
              <CalendarClock className="h-3 w-3" />
              {new Date(todayTask.task.deadline.dueDate).toLocaleDateString(
                "ja-JP",
                { month: "short", day: "numeric" },
              )}
              まで
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 self-end px-3 md:self-auto md:px-2"
          onClick={() => onEdit(todayTask.task)}
        >
          編集
        </Button>
      </div>
    </Card>
  );
}
