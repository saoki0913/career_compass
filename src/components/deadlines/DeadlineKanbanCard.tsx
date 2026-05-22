"use client";

import Link from "next/link";
import { Building2, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEADLINE_TYPE_LABELS, type DeadlineType } from "@/hooks/useCompanyDeadlines";
import { DeadlineProgressBar } from "./DeadlineProgressBar";
import {
  computeDeadlineDaysLeft,
  formatDeadlineDueDate,
  getDeadlineDaysLeftClass,
  getDeadlineDaysLeftLabel,
} from "./deadline-display";
import type { DeadlineDashboardItem } from "@/hooks/useDeadlinesDashboard";

interface DeadlineKanbanCardProps {
  item: DeadlineDashboardItem;
}

export function DeadlineKanbanCard({ item }: DeadlineKanbanCardProps) {
  const daysLeft = computeDeadlineDaysLeft(item.dueDate);
  const typeLabel =
    DEADLINE_TYPE_LABELS[item.type as DeadlineType] ?? item.type;
  const hasTasks = item.totalTasks > 0;

  return (
    <Link
      href={`/companies/${item.companyId}`}
      className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_42px_-26px_rgba(15,23,42,0.48)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:rounded-xl lg:p-3.5"
    >
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{item.companyName}</span>
      </div>

      <p className="mb-2 text-[15px] font-semibold leading-snug text-slate-950 transition-colors line-clamp-2 group-hover:text-primary lg:text-sm">
        {item.title}
      </p>

      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="max-w-[70%] truncate rounded-full bg-sky-50 px-2.5 text-xs text-slate-700">
          {typeLabel}
        </Badge>
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            getDeadlineDaysLeftClass(daysLeft, item.status),
          )}
        >
          {getDeadlineDaysLeftLabel(daysLeft, item.status)}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{formatDeadlineDueDate(item.dueDate)}</span>
      </div>

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
