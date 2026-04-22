"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEADLINE_TYPE_LABELS, type DeadlineType } from "@/hooks/useCompanyDeadlines";
import { DeadlineProgressBar } from "./DeadlineProgressBar";
import type {
  DeadlineDashboardItem,
  DeadlineComputedStatus,
} from "@/hooks/useDeadlinesDashboard";

interface DeadlineListViewProps {
  deadlines: DeadlineDashboardItem[];
}

const STATUS_CONFIG: Record<
  DeadlineComputedStatus,
  { label: string; variant: "secondary" | "soft-primary" | "soft-success" | "soft-destructive" }
> = {
  not_started: { label: "未着手", variant: "secondary" },
  in_progress: { label: "進行中", variant: "soft-primary" },
  completed: { label: "完了", variant: "soft-success" },
  overdue: { label: "期限切れ", variant: "soft-destructive" },
};

function computeDaysLeft(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysLeftLabel(daysLeft: number, status: string): string {
  if (status === "completed") return "完了";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return "今日";
  if (daysLeft === 1) return "明日";
  return `あと${daysLeft}日`;
}

function getDaysLeftColor(daysLeft: number, status: string): string {
  if (status === "completed") return "text-success";
  if (status === "overdue" || daysLeft < 0) return "text-destructive font-medium";
  if (daysLeft < 3) return "text-destructive";
  if (daysLeft < 7) return "text-warning-foreground";
  return "text-muted-foreground";
}

export function DeadlineListView({ deadlines }: DeadlineListViewProps) {
  return (
    <div className="space-y-2">
      {/* Header row (desktop only) */}
      <div className="hidden items-center gap-4 rounded-lg px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
        <span className="w-36">企業</span>
        <span className="flex-1">タイトル</span>
        <span className="w-24 text-center">種類</span>
        <span className="w-20 text-center">ステータス</span>
        <span className="w-24 text-center">期限</span>
        <span className="w-20 text-center">残日数</span>
        <span className="w-28">進捗</span>
      </div>

      {deadlines.map((item) => {
        const daysLeft = computeDaysLeft(item.dueDate);
        const typeLabel =
          DEADLINE_TYPE_LABELS[item.type as DeadlineType] ?? item.type;
        const statusCfg = STATUS_CONFIG[item.status];
        const hasTasks = item.totalTasks > 0;

        return (
          <Link
            key={item.id}
            href={`/companies/${item.companyId}`}
            className="group flex flex-col gap-2 rounded-xl border border-border/50 bg-card p-4 transition-all duration-200 hover:shadow-sm hover:border-border sm:flex-row sm:items-center sm:gap-4 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
          >
            {/* Company name */}
            <span className="w-36 shrink-0 truncate text-xs text-muted-foreground sm:text-sm">
              {item.companyName}
            </span>

            {/* Title */}
            <span className="flex-1 text-sm font-medium leading-snug group-hover:text-primary transition-colors">
              {item.title}
            </span>

            {/* Mobile: badges row */}
            <div className="flex flex-wrap items-center gap-2 sm:contents">
              {/* Type */}
              <Badge variant="secondary" className="w-fit text-xs sm:w-24 sm:justify-center">
                {typeLabel}
              </Badge>

              {/* Status */}
              <Badge variant={statusCfg.variant} className="w-fit text-xs sm:w-20 sm:justify-center">
                {statusCfg.label}
              </Badge>

              {/* Due date */}
              <span className="w-24 text-center text-xs tabular-nums text-muted-foreground">
                {new Date(item.dueDate).toLocaleDateString("ja-JP", {
                  month: "short",
                  day: "numeric",
                })}
              </span>

              {/* Days left */}
              <span
                className={cn(
                  "w-20 text-center text-xs tabular-nums",
                  getDaysLeftColor(daysLeft, item.status),
                )}
              >
                {getDaysLeftLabel(daysLeft, item.status)}
              </span>

              {/* Progress */}
              <div className="w-28">
                {hasTasks ? (
                  <DeadlineProgressBar
                    value={item.completedTasks}
                    max={item.totalTasks}
                    label={`${item.completedTasks}/${item.totalTasks}`}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground/50">-</span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
