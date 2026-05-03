"use client";

import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  type CompanyStatus,
  type StatusCategory,
  getStatusConfig,
  GROUPED_STATUSES,
  CATEGORY_LABELS,
} from "@/lib/constants/status";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusDropdownProps {
  currentStatus: CompanyStatus;
  onStatusChange: (newStatus: CompanyStatus) => void;
  disabled?: boolean;
}

const CATEGORY_ORDER: StatusCategory[] = [
  "not_started",
  "in_progress",
  "completed",
];

export function StatusDropdown({
  currentStatus,
  onStatusChange,
  disabled = false,
}: StatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const statusConfig = getStatusConfig(currentStatus);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
            "cursor-pointer hover:ring-2 hover:ring-ring/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            statusConfig.bgColor,
            statusConfig.color,
            disabled && "opacity-50 cursor-not-allowed hover:ring-0"
          )}
          aria-label={`ステータス: ${statusConfig.label}。クリックして変更`}
        >
          {statusConfig.label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" sideOffset={4}>
        <div className="max-h-80 overflow-y-auto">
          {CATEGORY_ORDER.map((category) => {
            const statuses = GROUPED_STATUSES[category];
            if (!statuses || statuses.length === 0) return null;

            return (
              <div key={category} role="group" aria-label={CATEGORY_LABELS[category]}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {CATEGORY_LABELS[category]}
                </div>
                {statuses.map((status) => {
                  const isSelected = status.value === currentStatus;
                  return (
                    <button
                      key={status.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                        "cursor-default hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:bg-accent focus-visible:text-accent-foreground",
                        isSelected && "bg-accent/50"
                      )}
                      onClick={() => {
                        if (status.value !== currentStatus) {
                          onStatusChange(status.value);
                        }
                        setOpen(false);
                      }}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full flex-shrink-0",
                          status.color.replace("text-", "bg-")
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-left">{status.label}</span>
                      {isSelected && (
                        <Check className="h-4 w-4 flex-shrink-0 text-current opacity-70" />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
