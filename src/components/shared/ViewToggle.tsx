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
}

export function ViewToggle({ options, activeKey, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
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
