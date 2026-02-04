"use client";

import { cn } from "@/lib/utils";

// Icons
const LightbulbIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

interface WorkBlockFABProps {
  onClick: () => void;
  isVisible?: boolean;
  className?: string;
}

export function WorkBlockFAB({ onClick, isVisible = true, className }: WorkBlockFABProps) {
  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-40",
        "flex items-center gap-2 px-4 py-3 rounded-full",
        "bg-gradient-to-r from-amber-500 to-orange-500",
        "text-white font-medium shadow-lg",
        "hover:from-amber-600 hover:to-orange-600",
        "hover:shadow-xl hover:scale-105",
        "active:scale-95",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2",
        className
      )}
      title="タスクを提案"
    >
      <LightbulbIcon />
      <span className="hidden sm:inline">タスク提案</span>
    </button>
  );
}

export default WorkBlockFAB;
