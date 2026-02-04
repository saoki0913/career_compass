"use client";

import { cn } from "@/lib/utils";

/**
 * PriorityBadge Component
 *
 * Visual indicator for improvement priority level.
 * Maps difficulty levels to priority for better UX understanding.
 *
 * UX Psychology:
 * - Color coding for quick recognition (red=high, yellow=medium, green=low)
 * - Consistent with CLAUDE.md confidence level guidelines
 */

export type Priority = "high" | "medium" | "low";
export type Difficulty = "easy" | "medium" | "hard";

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
  showLabel?: boolean;
}

const PRIORITY_CONFIG: Record<Priority, {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: React.ReactNode;
}> = {
  high: {
    label: "高優先度",
    bgColor: "bg-muted",
    textColor: "text-foreground",
    borderColor: "border-border",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  medium: {
    label: "中優先度",
    bgColor: "bg-muted/50",
    textColor: "text-muted-foreground",
    borderColor: "border-border/50",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  low: {
    label: "低優先度",
    bgColor: "bg-transparent",
    textColor: "text-muted-foreground/70",
    borderColor: "border-border/30",
    icon: (
      <svg className="w-3 h-3" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

/**
 * Map difficulty (easy/medium/hard) to priority (high/medium/low)
 * - easy fixes = high priority (quick wins)
 * - medium fixes = medium priority
 * - hard fixes = low priority (can defer)
 */
export function difficultyToPriority(difficulty: Difficulty | undefined): Priority {
  switch (difficulty) {
    case "easy":
      return "high";
    case "medium":
      return "medium";
    case "hard":
      return "low";
    default:
      return "medium";
  }
}

export function PriorityBadge({
  priority,
  className,
  showLabel = true,
}: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        config.bgColor,
        config.textColor,
        config.borderColor,
        className
      )}
    >
      {config.icon}
      {showLabel && config.label}
    </span>
  );
}

/**
 * Compact version showing only the icon with tooltip
 */
export function PriorityIcon({
  priority,
  className,
}: Omit<PriorityBadgeProps, "showLabel">) {
  const config = PRIORITY_CONFIG[priority];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-5 h-5 rounded-full",
        config.bgColor,
        config.textColor,
        className
      )}
      title={config.label}
    >
      {config.icon}
    </span>
  );
}

export default PriorityBadge;
