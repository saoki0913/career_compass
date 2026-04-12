"use client";

import { cn } from "@/lib/utils";
import { DeadlineKanbanCard } from "./DeadlineKanbanCard";
import type {
  DeadlineDashboardItem,
  DeadlineComputedStatus,
} from "@/hooks/useDeadlinesDashboard";

interface DeadlineKanbanBoardProps {
  deadlines: DeadlineDashboardItem[];
}

interface KanbanColumn {
  status: DeadlineComputedStatus;
  label: string;
  emptyLabel: string;
  accentClass: string;
  headerBorderClass: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    status: "not_started",
    label: "未着手",
    emptyLabel: "未着手の締切はありません",
    accentClass: "text-muted-foreground",
    headerBorderClass: "border-muted-foreground/30",
  },
  {
    status: "in_progress",
    label: "進行中",
    emptyLabel: "進行中の締切はありません",
    accentClass: "text-primary",
    headerBorderClass: "border-primary/40",
  },
  {
    status: "completed",
    label: "完了",
    emptyLabel: "完了した締切はありません",
    accentClass: "text-success",
    headerBorderClass: "border-success/40",
  },
  {
    status: "overdue",
    label: "期限切れ",
    emptyLabel: "期限切れの締切はありません",
    accentClass: "text-destructive",
    headerBorderClass: "border-destructive/40",
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

export function DeadlineKanbanBoard({ deadlines }: DeadlineKanbanBoardProps) {
  const grouped = groupByStatus(deadlines);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.status];
        return (
          <section
            key={col.status}
            className="flex flex-col"
            aria-label={`${col.label}の締切`}
          >
            {/* Column header */}
            <div
              className={cn(
                "mb-3 flex items-center gap-2 border-b-2 pb-2",
                col.headerBorderClass,
              )}
            >
              <h3
                className={cn(
                  "text-sm font-semibold",
                  col.accentClass,
                )}
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
                items.map((item) => (
                  <DeadlineKanbanCard key={item.id} item={item} />
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
