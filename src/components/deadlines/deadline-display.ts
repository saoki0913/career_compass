import { startOfJstDayAsUtc } from "@/lib/datetime/jst";
import type { DeadlineComputedStatus } from "@/hooks/useDeadlinesDashboard";

export const DEADLINE_STATUS_META: Record<
  DeadlineComputedStatus,
  {
    label: string;
    emptyLabel: string;
    emptyDescription: string;
    accentClass: string;
    borderClass: string;
    emptyIconClass: string;
  }
> = {
  not_started: {
    label: "未着手",
    emptyLabel: "未着手の締切はありません",
    emptyDescription: "新しい締切を追加してタスク管理を始めましょう",
    accentClass: "text-slate-800",
    borderClass: "border-slate-400",
    emptyIconClass: "text-slate-400",
  },
  in_progress: {
    label: "進行中",
    emptyLabel: "進行中の締切はありません",
    emptyDescription: "タスクに取り組んで進捗を更新しましょう",
    accentClass: "text-primary",
    borderClass: "border-primary",
    emptyIconClass: "text-primary",
  },
  completed: {
    label: "完了",
    emptyLabel: "完了した締切はありません",
    emptyDescription: "タスクを完了するとここに表示されます",
    accentClass: "text-success",
    borderClass: "border-success",
    emptyIconClass: "text-success",
  },
  overdue: {
    label: "期限切れ",
    emptyLabel: "期限切れの締切はありません",
    emptyDescription: "期限切れの締切はここに表示されます",
    accentClass: "text-destructive",
    borderClass: "border-destructive",
    emptyIconClass: "text-destructive",
  },
};

export function computeDeadlineDaysLeft(dueDate: string): number {
  const todayStart = startOfJstDayAsUtc(new Date());
  const dueStart = startOfJstDayAsUtc(new Date(dueDate));
  return Math.ceil(
    (dueStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function formatDeadlineDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  return date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
  });
}

export function getDeadlineDaysLeftLabel(
  daysLeft: number,
  status: DeadlineComputedStatus,
): string {
  if (status === "completed") return "完了";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return "今日";
  if (daysLeft === 1) return "明日";
  return `あと${daysLeft}日`;
}

export function getDeadlineDaysLeftClass(
  daysLeft: number,
  status: DeadlineComputedStatus,
): string {
  if (status === "completed") return "text-success";
  if (status === "overdue" || daysLeft < 0) return "text-destructive font-semibold";
  if (daysLeft < 3) return "text-destructive font-semibold";
  if (daysLeft < 7) return "text-warning-foreground font-medium";
  return "text-muted-foreground";
}
