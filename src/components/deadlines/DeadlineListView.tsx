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

export function DeadlineListView({ deadlines }: DeadlineListViewProps) {
  return (
    <div className="space-y-2.5">
      <div className="hidden items-center gap-4 rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground lg:flex">
        <span className="w-36">企業</span>
        <span className="flex-1">タイトル</span>
        <span className="w-24 text-center">種類</span>
        <span className="w-20 text-center">ステータス</span>
        <span className="w-24 text-center">期限</span>
        <span className="w-20 text-center">残日数</span>
        <span className="w-28">進捗</span>
      </div>

      {deadlines.map((item) => {
        const daysLeft = computeDeadlineDaysLeft(item.dueDate);
        const typeLabel =
          DEADLINE_TYPE_LABELS[item.type as DeadlineType] ?? item.type;
        const statusCfg = STATUS_CONFIG[item.status];
        const hasTasks = item.totalTasks > 0;

        return (
          <Link
            key={item.id}
            href={`/companies/${item.companyId}`}
            className="group flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.45)] outline-none transition-all duration-200 hover:border-slate-300 hover:shadow-[0_18px_42px_-28px_rgba(15,23,42,0.48)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:flex-row lg:items-center lg:gap-4"
          >
            <span className="flex w-36 shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground lg:text-sm">
              <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.companyName}</span>
            </span>

            <span className="flex-1 text-[15px] font-semibold leading-snug text-slate-950 transition-colors group-hover:text-primary lg:text-sm">
              {item.title}
            </span>

            <div className="flex flex-wrap items-center gap-2 lg:contents">
              <Badge variant="secondary" className="w-fit rounded-full bg-sky-50 text-xs text-slate-700 lg:w-24 lg:justify-center">
                {typeLabel}
              </Badge>

              <Badge variant={statusCfg.variant} className="w-fit rounded-full text-xs lg:w-20 lg:justify-center">
                {statusCfg.label}
              </Badge>

              <span className="flex w-auto items-center gap-1.5 text-xs tabular-nums text-muted-foreground lg:w-24 lg:justify-center lg:text-center">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 lg:hidden" aria-hidden="true" />
                {formatDeadlineDueDate(item.dueDate)}
              </span>

              <span
                className={cn(
                  "w-auto text-xs tabular-nums lg:w-20 lg:text-center",
                  getDeadlineDaysLeftClass(daysLeft, item.status),
                )}
              >
                {getDeadlineDaysLeftLabel(daysLeft, item.status)}
              </span>

              <div className="min-w-[8rem] flex-1 lg:w-28 lg:flex-none">
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
