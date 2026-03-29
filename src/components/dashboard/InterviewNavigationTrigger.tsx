"use client";

import { cn } from "@/lib/utils";

function InterviewIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="h-5 w-5"
      fill={active ? "currentColor" : "none"}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={active ? 0 : 2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h8M8 14h5m-7 7 2.8-2.1a2 2 0 011.2-.4H19a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h1v3z"
      />
    </svg>
  );
}

export function InterviewNavigationTrigger({
  active,
  onClick,
  variant = "desktop",
}: {
  active: boolean;
  onClick: () => void;
  variant?: "desktop" | "mobile";
}) {
  if (variant === "mobile") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-full min-h-[44px] min-w-[44px] w-full flex-col items-center justify-start gap-1 rounded-lg px-1 py-1 transition-colors duration-200",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
        aria-current={active ? "page" : undefined}
        aria-label="面接対策"
      >
        <InterviewIcon active={active} />
        <span className={cn("text-[10px] leading-tight", active ? "font-semibold" : "font-medium")}>
          面接対策
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer whitespace-nowrap",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      面接対策
    </button>
  );
}

