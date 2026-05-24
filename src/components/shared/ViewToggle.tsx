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
    <div className={cn("flex h-12 w-full items-center gap-1 rounded-xl bg-muted/50 p-1 lg:h-8 lg:w-fit lg:rounded-lg lg:p-0.5", className)} role="group" aria-label="表示形式">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          aria-pressed={activeKey === option.key}
          className={cn(
            "flex h-10 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-sm font-medium transition-all duration-200 sm:px-2.5 lg:h-7 lg:w-[1.625rem] lg:flex-none lg:px-1",
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
