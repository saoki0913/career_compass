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

// Color coding for urgency levels
function getDaysLeftColor(daysLeft: number) {
  if (daysLeft <= 3) return "text-red-600 bg-red-50";
  if (daysLeft <= 7) return "text-orange-600 bg-orange-50";
  return "text-emerald-600 bg-emerald-50";
}

// UX Psychology: Scarcity Effect - Enhanced Japanese display with urgency indicators
function getDaysLeftDisplay(daysLeft: number) {
  if (daysLeft === 0) {
    return { text: "今日!", className: "text-red-600 font-bold" };
  }
  if (daysLeft === 1) {
    return { text: "明日!", className: "text-red-600 font-bold" };
  }
  if (daysLeft <= 3) {
    return { text: `あと${daysLeft}日!`, className: "text-red-600 font-semibold" };
  }
  if (daysLeft <= 7) {
    return { text: `あと${daysLeft}日`, className: "text-orange-600 font-medium" };
  }
  return { text: `${daysLeft}日後`, className: "text-emerald-600" };
}

// Urgent warning icon with optional animation
const UrgentIcon = ({ animate }: { animate: boolean }) => (
  <svg
    className={cn("w-4 h-4 text-red-500", animate && "animate-bounce")}
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
  </svg>
);

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
      {deadlines.map((deadline) => {
        const display = getDaysLeftDisplay(deadline.daysLeft);
        const isUrgent = deadline.daysLeft <= 1;
        const isToday = deadline.daysLeft === 0;

        return (
          <div
            key={deadline.id}
            className={cn(
              "group flex items-center gap-4 p-4 rounded-xl bg-card border transition-all duration-200",
              isUrgent
                ? "border-red-200 bg-red-50/30 hover:border-red-300 hover:shadow-md"
                : "border-border/50 hover:border-border hover:shadow-sm"
            )}
          >
            <div className="flex-shrink-0">
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs font-medium relative",
                  getDaysLeftColor(deadline.daysLeft)
                )}
              >
                {/* Urgent icon for deadlines within 1 day */}
                {isUrgent && (
                  <div className="absolute -top-1 -right-1">
                    <UrgentIcon animate={isToday} />
                  </div>
                )}
                <span className={cn("text-lg font-bold", isToday && "animate-pulse")}>
                  {deadline.daysLeft}
                </span>
                <span className="text-[10px] uppercase tracking-wide">
                  {deadline.daysLeft <= 1 ? "day" : "days"}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{deadline.company}</p>
              <p className="text-sm text-muted-foreground">{deadline.type}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              {/* Enhanced Japanese display */}
              <p className={cn("text-sm font-medium", display.className)}>
                {display.text}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(deadline.date)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
