import { Building2, CalendarClock, Star } from "lucide-react";
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
  return (
    <Card className="mb-6 overflow-hidden border-primary/20 bg-[linear-gradient(135deg,hsl(var(--primary)/0.08),hsl(var(--background))_62%)] gap-0 py-2 px-4 shadow-sm">
      <div className="flex min-h-[44px] items-center gap-3">
        {/* Left: label */}
        <div className="flex shrink-0 items-center gap-1.5 text-primary">
          <Star className="h-4 w-4 fill-current" />
          <span className="text-xs font-medium whitespace-nowrap">
            今日の最重要タスク
            {todayTask.mode === "DEADLINE" && " / 締切優先"}
            {todayTask.mode === "DEEP_DIVE" && " / 深掘り優先"}
          </span>
        </div>

        {/* Divider */}
        <div className="hidden h-4 w-px bg-border/50 sm:block" />

        {/* Middle: checkbox + title + metadata inline */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked="false"
            onClick={() => void todayTask.markComplete()}
            className="h-5 w-5 shrink-0 rounded-full border-2 border-primary transition-colors hover:bg-primary/10"
            aria-label="今日の最重要タスクを完了にする"
          />
          <span className="truncate text-sm font-medium">
            {todayTask.task.title}
          </span>
          {todayTask.task.company && (
            <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
              <Building2 className="h-3 w-3" />
              {todayTask.task.company.name}
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

        {/* Right: edit button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2"
          onClick={() => onEdit(todayTask.task)}
        >
          編集
        </Button>
      </div>
    </Card>
  );
}
