"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEADLINE_TYPE_LABELS, type DeadlineType } from "@/hooks/useCompanyDeadlines";
import { DeadlineProgressBar } from "./DeadlineProgressBar";
import type { DeadlineDashboardItem } from "@/hooks/useDeadlinesDashboard";

interface DeadlineKanbanCardProps {
  item: DeadlineDashboardItem;
}

const BuildingIcon = () => (
  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

function computeDaysLeft(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  return date.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
}

function getDaysLeftLabel(daysLeft: number, status: string): string {
  if (status === "completed") return "完了";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}日超過`;
  if (daysLeft === 0) return "今日";
  if (daysLeft === 1) return "明日";
  return `あと${daysLeft}日`;
}

function getDaysLeftColor(
  daysLeft: number,
  status: string,
): string {
  if (status === "completed") return "text-success";
  if (status === "overdue" || daysLeft < 0) return "text-destructive font-medium";
  if (daysLeft < 3) return "text-destructive";
  if (daysLeft < 7) return "text-warning-foreground";
  return "text-muted-foreground";
}

export function DeadlineKanbanCard({ item }: DeadlineKanbanCardProps) {
  const daysLeft = computeDaysLeft(item.dueDate);
  const typeLabel =
    DEADLINE_TYPE_LABELS[item.type as DeadlineType] ?? item.type;
  const hasTasks = item.totalTasks > 0;

  return (
    <Link
      href={`/companies/${item.companyId}`}
      className="group block rounded-xl border border-border/50 bg-card p-3.5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-border focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
    >
      {/* Company name */}
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BuildingIcon />
        <span className="truncate">{item.companyName}</span>
      </div>

      {/* Title */}
      <p className="mb-2 text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
        {item.title}
      </p>

      {/* Type badge and days left */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-xs">
          {typeLabel}
        </Badge>
        <span
          className={cn(
            "text-xs tabular-nums",
            getDaysLeftColor(daysLeft, item.status),
          )}
        >
          {getDaysLeftLabel(daysLeft, item.status)}
        </span>
      </div>

      {/* Due date row */}
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarIcon />
        <span>{formatDueDate(item.dueDate)}</span>
      </div>

      {/* Task progress bar */}
      {hasTasks && (
        <DeadlineProgressBar
          value={item.completedTasks}
          max={item.totalTasks}
          label={`${item.completedTasks}/${item.totalTasks}`}
        />
      )}
    </Link>
  );
}
