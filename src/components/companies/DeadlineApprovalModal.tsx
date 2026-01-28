"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEADLINE_TYPE_LABELS } from "@/hooks/useCompanyDeadlines";
import type { Deadline, DeadlineType } from "@/hooks/useCompanyDeadlines";

interface DeadlineApprovalModalProps {
  isOpen: boolean;
  deadlines: Deadline[];
  onClose: () => void;
  onConfirm: (deadlineIds: string[]) => Promise<void>;
}

// Icons
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// Confidence color configuration
const confidenceConfig = {
  high: { bg: "bg-emerald-100", text: "text-emerald-700", label: "高", border: "border-emerald-200" },
  medium: { bg: "bg-amber-100", text: "text-amber-700", label: "中", border: "border-amber-200" },
  low: { bg: "bg-red-100", text: "text-red-700", label: "低", border: "border-red-200" },
};

export function DeadlineApprovalModal({
  isOpen,
  deadlines,
  onClose,
  onConfirm,
}: DeadlineApprovalModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter to unconfirmed deadlines only
  const unconfirmedDeadlines = deadlines.filter((d) => !d.isConfirmed);

  // Initialize selection: HIGH and MEDIUM confidence are checked, LOW is unchecked
  useEffect(() => {
    if (isOpen) {
      const initialSelected = new Set<string>();
      unconfirmedDeadlines.forEach((d) => {
        if (d.confidence !== "low") {
          initialSelected.add(d.id);
        }
      });
      setSelectedIds(initialSelected);
      setError(null);
    }
  }, [isOpen, unconfirmedDeadlines.map((d) => d.id).join(",")]);

  const toggleDeadline = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setError(null);
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(unconfirmedDeadlines.map((d) => d.id)));
    } else {
      setSelectedIds(new Set());
    }
    setError(null);
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) {
      setError("少なくとも1件の締切を選択してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onConfirm(Array.from(selectedIds));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "承認に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || unconfirmedDeadlines.length === 0) return null;

  const allSelected = selectedIds.size === unconfirmedDeadlines.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < unconfirmedDeadlines.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <Card className="relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between border-b shrink-0">
          <CardTitle className="text-lg">締切の承認</CardTitle>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <CloseIcon />
          </button>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Description */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              AIが抽出した締切を確認してください。内容を確認の上、承認する締切を選択してください。
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-red-600">低信頼度の締切</span>は内容が不正確な可能性があるため、初期状態ではチェックが外れています。
            </p>
          </div>

          {/* Select all */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => toggleAll(!allSelected)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span
                className={cn(
                  "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                  allSelected
                    ? "bg-primary border-primary text-primary-foreground"
                    : someSelected
                    ? "border-primary bg-primary/20"
                    : "border-muted-foreground/40"
                )}
              >
                {(allSelected || someSelected) && <CheckIcon />}
              </span>
              すべて選択 ({selectedIds.size}/{unconfirmedDeadlines.length})
            </button>
          </div>

          {/* Deadline list */}
          <div className="space-y-2">
            {unconfirmedDeadlines.map((deadline) => {
              const isSelected = selectedIds.has(deadline.id);
              const confidenceStyle = deadline.confidence ? confidenceConfig[deadline.confidence] : null;
              const dueDate = new Date(deadline.dueDate);

              return (
                <button
                  key={deadline.id}
                  type="button"
                  onClick={() => toggleDeadline(deadline.id)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left",
                    isSelected
                      ? "bg-primary/5 border-primary"
                      : confidenceStyle
                      ? `bg-white ${confidenceStyle.border}`
                      : "bg-white border-border"
                  )}
                >
                  {/* Checkbox */}
                  <span
                    className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {isSelected && <CheckIcon />}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {DEADLINE_TYPE_LABELS[deadline.type as DeadlineType] || deadline.type}
                      </span>
                      {confidenceStyle && (
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full",
                            confidenceStyle.bg,
                            confidenceStyle.text
                          )}
                        >
                          信頼度: {confidenceStyle.label}
                        </span>
                      )}
                    </div>
                    <p className="font-medium mt-1 text-sm">{deadline.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {dueDate.toLocaleDateString("ja-JP", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </p>
                    {deadline.sourceUrl && (
                      <a
                        href={deadline.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        <ExternalLinkIcon />
                        取得元を確認
                      </a>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <div className="border-t p-4 flex gap-3 shrink-0">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isSubmitting}>
            キャンセル
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">処理中...</span>
              </>
            ) : (
              `${selectedIds.size}件を承認`
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
