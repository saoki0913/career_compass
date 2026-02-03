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
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    borderColor: "border-red-200",
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
  medium: {
    label: "中優先度",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 002 0V7zm0 6a1 1 0 10-2 0 1 1 0 002 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  low: {
    label: "低優先度",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    icon: (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
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
