"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkBlockSuggestion } from "@/hooks/useCalendar";

function LoadingSpinner() {
  return (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export interface WorkBlockSuggestionsModalProps {
  isOpen: boolean;
  selectedDate: Date | null;
  suggestions: WorkBlockSuggestion[];
  isLoading: boolean;
  onClose: () => void;
  onCreateFromSuggestion: (suggestion: WorkBlockSuggestion) => Promise<void>;
}

export function WorkBlockSuggestionsModal({
  isOpen,
  selectedDate,
  suggestions,
  isLoading,
  onClose,
  onCreateFromSuggestion,
}: WorkBlockSuggestionsModalProps) {
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleCreate = async (suggestion: WorkBlockSuggestion) => {
    setIsCreating(true);
    try {
      await onCreateFromSuggestion(suggestion);
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen || !selectedDate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={onClose}>
      <Card className="max-h-[min(80vh,42rem)] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>タスク提案</CardTitle>
          <p className="text-sm text-muted-foreground">
            {selectedDate.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
            })}
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">この日は空き時間が見つかりませんでした</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion, i) => {
                const startTime = new Date(suggestion.start).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const endTime = new Date(suggestion.end).toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={i} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{suggestion.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {startTime} - {endTime}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleCreate(suggestion)}
                        disabled={isCreating}
                      >
                        {isCreating ? <LoadingSpinner /> : "追加"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end mt-6">
            <Button variant="outline" onClick={onClose}>
              閉じる
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
