"use client";

import { cn } from "@/lib/utils";

interface CharLimitSelectorProps {
  value: 300 | 400 | 500;
  onChange: (limit: 300 | 400 | 500) => void;
  disabled?: boolean;
}

const LIMITS = [300, 400, 500] as const;

export function CharLimitSelector({ value, onChange, disabled = false }: CharLimitSelectorProps) {
  return (
    <>
      <p className="text-xs font-medium text-muted-foreground xl:shrink-0">文字数</p>
      <div className="grid grid-cols-3 gap-2">
        {LIMITS.map((limit) => (
          <button
            key={limit}
            type="button"
            onClick={() => onChange(limit)}
            disabled={disabled}
            className={cn(
              "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              value === limit
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-secondary",
            )}
          >
            {limit}字
          </button>
        ))}
      </div>
    </>
  );
}
