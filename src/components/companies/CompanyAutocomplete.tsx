"use client";

import { useState, useRef, useEffect } from "react";
import { useCompanySuggestions, type CompanySuggestion } from "@/hooks/useCompanySuggestions";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface CompanyAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (name: string, industry: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  required?: boolean;
}

export function CompanyAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "株式会社〇〇",
  className,
  id,
  required,
}: CompanyAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, isLoading } = useCompanySuggestions(value);

  // Group suggestions by industry
  const groupedSuggestions = suggestions.reduce<Record<string, CompanySuggestion[]>>(
    (acc, suggestion) => {
      const industry = suggestion.industry || "その他";
      if (!acc[industry]) {
        acc[industry] = [];
      }
      acc[industry].push(suggestion);
      return acc;
    },
    {}
  );

  const shouldShowSuggestions = isFocused && suggestions.length > 0 && value.trim().length >= 1;

  const handleSelect = (suggestion: CompanySuggestion) => {
    onChange(suggestion.name);
    onSelect?.(suggestion.name, suggestion.industry);
    setIsFocused(false);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    setOpen(false);
  };

  useEffect(() => {
    setOpen(shouldShowSuggestions);
  }, [shouldShowSuggestions]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            id={id}
            value={value}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder={placeholder}
            className={cn("h-10", className)}
            required={required}
            autoComplete="off"
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg
                className="w-4 h-4 animate-spin text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            {suggestions.length === 0 ? (
              <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                候補が見つかりません
              </CommandEmpty>
            ) : (
              Object.entries(groupedSuggestions).map(([industry, companies]) => (
                <CommandGroup key={industry} heading={industry}>
                  {companies.map((suggestion) => (
                    <CommandItem
                      key={suggestion.name}
                      value={suggestion.name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(suggestion);
                      }}
                      onSelect={() => handleSelect(suggestion)}
                      className="cursor-pointer"
                    >
                      {suggestion.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
