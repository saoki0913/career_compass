"use client";

import type { ComponentType } from "react";
import { Activity, Check, ClipboardList, FileClock, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeadlineKanbanCard } from "./DeadlineKanbanCard";
import { DEADLINE_STATUS_META } from "./deadline-display";
import type {
  DeadlineDashboardItem,
  DeadlineComputedStatus,
} from "@/hooks/useDeadlinesDashboard";

interface DeadlineKanbanBoardProps {
  deadlines: DeadlineDashboardItem[];
  visibleStatuses?: DeadlineComputedStatus[];
}

interface KanbanColumn {
  status: DeadlineComputedStatus;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const COLUMNS: KanbanColumn[] = [
  {
    status: "not_started",
    icon: ClipboardList,
  },
  {
    status: "in_progress",
    icon: Activity,
  },
  {
    status: "completed",
    icon: Check,
  },
  {
    status: "overdue",
    icon: FileClock,
  },
];

function groupByStatus(
  deadlines: DeadlineDashboardItem[],
): Record<DeadlineComputedStatus, DeadlineDashboardItem[]> {
  const grouped: Record<DeadlineComputedStatus, DeadlineDashboardItem[]> = {
    not_started: [],
    in_progress: [],
    completed: [],
    overdue: [],
  };

  for (const item of deadlines) {
    const bucket = grouped[item.status];
    if (bucket) {
      bucket.push(item);
    }
  }

  return grouped;
}

export function DeadlineKanbanBoard({
  deadlines,
  visibleStatuses,
}: DeadlineKanbanBoardProps) {
  const grouped = groupByStatus(deadlines);
  const columns = visibleStatuses
    ? COLUMNS.filter((col) => visibleStatuses.includes(col.status))
    : COLUMNS;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 xl:grid-cols-4 xl:gap-6">
      {columns.map((col) => {
        const items = grouped[col.status];
        const meta = DEADLINE_STATUS_META[col.status];
        const EmptyIcon = col.icon;
        return (
          <section
            key={col.status}
            className="flex flex-col"
            aria-label={`${meta.label}の締切`}
          >
            <div
              className={cn(
                "mb-3 flex items-center gap-2 border-b-2 pb-2.5",
                meta.borderClass,
              )}
            >
              <h3
                className={cn(
                  "text-base font-bold md:text-sm",
                  meta.accentClass,
                )}
              >
                {meta.label}
              </h3>
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                  items.length > 0
                    ? "bg-slate-100 text-slate-600"
                    : "bg-transparent text-muted-foreground/50",
                )}
              >
                {items.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 md:gap-3">
              {items.length > 0 ? (
                items.map((item) => (
                  <DeadlineKanbanCard key={item.id} item={item} />
                ))
              ) : (
                <div className="flex min-h-[6.25rem] items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] md:min-h-[16rem] md:justify-center md:p-6 xl:min-h-[32rem]">
                  <div className="flex w-full items-center gap-4 md:flex-col md:gap-4 md:text-center">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white/80 md:h-16 md:w-16">
                      <EmptyIcon
                        className={cn("h-5 w-5 md:h-7 md:w-7", meta.emptyIconClass)}
                        aria-hidden={true}
                      />
                    </span>
                    <div className="min-w-0 flex-1 md:flex-none">
                      <p className="text-sm font-medium text-slate-700 md:text-sm">
                        {meta.emptyLabel}
                      </p>
                      <p className="mt-1 hidden text-sm leading-relaxed text-muted-foreground md:block">
                        {meta.emptyDescription}
                      </p>
                    </div>
                    <MoreHorizontal
                      className="h-5 w-5 shrink-0 text-muted-foreground/50 md:hidden"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
