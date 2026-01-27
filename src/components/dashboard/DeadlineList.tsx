import { cn } from "@/lib/utils";

interface Deadline {
  id: string;
  company: string;
  type: string;
  date: Date;
  daysLeft: number;
}

interface DeadlineListProps {
  deadlines: Deadline[];
  className?: string;
}

function getDaysLeftColor(daysLeft: number) {
  if (daysLeft <= 3) return "text-red-600 bg-red-50";
  if (daysLeft <= 7) return "text-orange-600 bg-orange-50";
  return "text-emerald-600 bg-emerald-50";
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function DeadlineList({ deadlines, className }: DeadlineListProps) {
  if (deadlines.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {deadlines.map((deadline) => (
        <div
          key={deadline.id}
          className="group flex items-center gap-4 p-4 rounded-xl bg-card border border-border/50 hover:border-border hover:shadow-sm transition-all duration-200"
        >
          <div className="flex-shrink-0">
            <div
              className={cn(
                "w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs font-medium",
                getDaysLeftColor(deadline.daysLeft)
              )}
            >
              <span className="text-lg font-bold">{deadline.daysLeft}</span>
              <span className="text-[10px] uppercase tracking-wide">days</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{deadline.company}</p>
            <p className="text-sm text-muted-foreground">{deadline.type}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-sm font-medium">{formatDate(deadline.date)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
