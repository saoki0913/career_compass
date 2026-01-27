import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  variant?: "default" | "primary" | "accent";
  className?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
        variant === "default" && "bg-card border border-border/50 shadow-sm",
        variant === "primary" &&
          "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
        variant === "accent" &&
          "bg-gradient-to-br from-accent to-accent/80 text-accent-foreground",
        className
      )}
    >
      <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-10">
        <div className="w-full h-full rounded-full bg-current" />
      </div>
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p
              className={cn(
                "text-sm font-medium",
                variant === "default" ? "text-muted-foreground" : "opacity-90"
              )}
            >
              {title}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p
                className={cn(
                  "mt-1 text-sm",
                  variant === "default" ? "text-muted-foreground" : "opacity-80"
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div
            className={cn(
              "p-3 rounded-xl",
              variant === "default" && "bg-secondary",
              variant !== "default" && "bg-white/20"
            )}
          >
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                trend.value >= 0
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800",
                variant !== "default" && "bg-white/20 text-current"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}%
            </span>
            <span
              className={cn(
                "text-xs",
                variant === "default" ? "text-muted-foreground" : "opacity-80"
              )}
            >
              {trend.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
