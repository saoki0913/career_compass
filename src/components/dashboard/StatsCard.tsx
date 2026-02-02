import Link from "next/link";
import { cn } from "@/lib/utils";

// Arrow icon for clickable cards
const ArrowRightIcon = () => (
  <svg
    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5l7 7-7 7"
    />
  </svg>
);

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
  onClick?: () => void;
  href?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  className,
  onClick,
  href,
}: StatsCardProps) {
  const isClickable = onClick || href;

  const cardContent = (
    <div
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-2xl p-6 transition-all duration-200",
        isClickable && "cursor-pointer",
        "hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99]",
        variant === "default" && "bg-card border border-border/50 shadow-sm",
        variant === "primary" &&
          "bg-gradient-to-br from-primary via-primary/95 to-primary/85 text-primary-foreground shadow-md shadow-primary/20",
        variant === "accent" &&
          "bg-gradient-to-br from-accent via-accent/95 to-accent/85 text-accent-foreground shadow-md shadow-accent/20",
        className
      )}
    >
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-[0.08]">
        <div className="w-full h-full rounded-full bg-current" />
      </div>
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p
              className={cn(
                "text-sm font-medium tracking-wide",
                variant === "default" ? "text-muted-foreground" : "opacity-90"
              )}
            >
              {title}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p
                className={cn(
                  "mt-1.5 text-sm",
                  variant === "default" ? "text-muted-foreground" : "opacity-80"
                )}
              >
                {subtitle}
              </p>
            )}
          </div>
          <div
            className={cn(
              "p-3 rounded-xl transition-colors duration-200",
              variant === "default" && "bg-secondary",
              variant !== "default" && "bg-white/15 backdrop-blur-sm"
            )}
          >
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                trend.value >= 0
                  ? "bg-success/15 text-success dark:bg-success/20"
                  : "bg-destructive/15 text-destructive dark:bg-destructive/20",
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
        {/* Arrow indicator for clickable cards */}
        {isClickable && (
          <div
            className={cn(
              "absolute bottom-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity",
              variant !== "default" && "text-current"
            )}
          >
            <ArrowRightIcon />
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{cardContent}</Link>;
  }

  return cardContent;
}
