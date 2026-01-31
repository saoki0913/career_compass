/**
 * MultiSelect Component
 *
 * A dropdown with checkboxes for multi-selection
 */

"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "選択",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map((o) => o.value));
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  // Display text
  const displayText = React.useMemo(() => {
    if (selected.length === 0) {
      return placeholder;
    }
    if (selected.length <= 2) {
      return selected
        .map((v) => options.find((o) => o.value === v)?.label || v)
        .join(", ");
    }
    return `${placeholder} (${selected.length})`;
  }, [selected, options, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between font-normal",
            selected.length > 0 && "text-foreground",
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            {selected.length > 0 && (
              <X
                className="h-4 w-4 opacity-50 hover:opacity-100"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="p-2 border-b">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
          >
            <Checkbox
              checked={selected.length === options.length}
              className="pointer-events-none"
            />
            <span>すべて選択</span>
          </button>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => handleToggle(option.value)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors",
                  isSelected ? "bg-primary/10" : "hover:bg-muted"
                )}
              >
                <Checkbox checked={isSelected} className="pointer-events-none" />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
