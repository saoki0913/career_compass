"use client";

import { cn } from "@/lib/utils";
import type {
  DeadlineDashboardSummary,
  DeadlineComputedStatus,
} from "@/hooks/useDeadlinesDashboard";

interface DeadlineSummaryStatsProps {
  summary: DeadlineDashboardSummary;
  activeStatus?: DeadlineComputedStatus;
  onStatusClick: (status: DeadlineComputedStatus | undefined) => void;
}

interface StatItem {
  label: string;
  value: number;
  suffix?: string;
  status?: DeadlineComputedStatus;
  accentClass: string;
  iconBgClass: string;
}

const CircleIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
  </svg>
);

const PlayIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <polygon points="5,3 19,12 5,21" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertCircleIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ClipboardListIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const PercentIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 5L5 19M6.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 20a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
  </svg>
);

const STATUS_ICONS: Record<string, React.ReactNode> = {
  total: <ClipboardListIcon />,
  not_started: <CircleIcon />,
  in_progress: <PlayIcon />,
  completed: <CheckCircleIcon />,
  overdue: <AlertCircleIcon />,
  rate: <PercentIcon />,
};

export function DeadlineSummaryStats({
  summary,
  activeStatus,
  onStatusClick,
}: DeadlineSummaryStatsProps) {
  const stats: StatItem[] = [
    {
      label: "全体",
      value: summary.total,
      accentClass: "text-foreground",
      iconBgClass: "bg-muted text-muted-foreground",
    },
    {
      label: "未着手",
      value: summary.notStarted,
      status: "not_started",
      accentClass: "text-muted-foreground",
      iconBgClass: "bg-muted text-muted-foreground",
    },
    {
      label: "進行中",
      value: summary.inProgress,
      status: "in_progress",
      accentClass: "text-primary",
      iconBgClass: "bg-primary/10 text-primary",
    },
    {
      label: "完了",
      value: summary.completed,
      status: "completed",
      accentClass: "text-success",
      iconBgClass: "bg-success/10 text-success",
    },
    {
      label: "期限切れ",
      value: summary.overdue,
      status: "overdue",
      accentClass: "text-destructive",
      iconBgClass: "bg-destructive/10 text-destructive",
    },
    {
      label: "完了率",
      value: summary.completionRate,
      suffix: "%",
      accentClass: "text-foreground",
      iconBgClass: "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => {
        const isClickable = stat.status != null;
        const isActive = stat.status != null && activeStatus === stat.status;
        const statusKey = stat.status ?? (stat.suffix === "%" ? "rate" : "total");

        return (
          <button
            key={stat.label}
            type="button"
            disabled={!isClickable}
            onClick={() => {
              if (!isClickable) return;
              onStatusClick(isActive ? undefined : stat.status);
            }}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200",
              isClickable
                ? "cursor-pointer hover:shadow-sm hover:-translate-y-0.5"
                : "cursor-default",
              isActive
                ? "border-primary/40 bg-primary/5 shadow-sm"
                : "border-border/50 bg-card",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                stat.iconBgClass,
              )}
            >
              {STATUS_ICONS[statusKey]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={cn("text-lg font-bold tabular-nums leading-tight", stat.accentClass)}>
                {stat.value}
                {stat.suffix && (
                  <span className="text-sm font-medium">{stat.suffix}</span>
                )}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
