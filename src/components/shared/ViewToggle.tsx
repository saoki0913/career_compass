"use client";

import { cn } from "@/lib/utils";

interface ViewToggleOption {
  key: string;
  icon: React.ReactNode;
  label: string;
}

interface ViewToggleProps {
  options: ViewToggleOption[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function ViewToggle({ options, activeKey, onChange, className }: ViewToggleProps) {
  return (
    <div className={cn("flex items-center gap-1 rounded-lg bg-muted/50 p-0.5 sm:p-1", className)} role="group" aria-label="表示形式">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={activeKey === option.key}
          className={cn(
            "flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 py-1 text-sm font-medium transition-all duration-200 sm:px-2.5 sm:py-1.5 md:flex-none",
            activeKey === option.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
