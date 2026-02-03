"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatElapsedTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * EnhancedProcessingSteps Component
 *
 * An enhanced version of ProcessingSteps with:
 * - Cancel button support
 * - Elapsed time display
 * - Progress bar visualization
 * - Improved UX feedback
 *
 * UX Psychology: Labor Illusion + User Control
 */

export interface ProcessingStep {
  id: string;
  label: string;
  subLabel?: string; // Additional context for the step
  duration: number; // Display duration in milliseconds
}

interface EnhancedProcessingStepsProps {
  steps: ProcessingStep[];
  isActive: boolean;
  elapsedTime?: number; // Elapsed time in seconds
  onCancel?: () => void;
  isCancelling?: boolean;
  cancelLabel?: string;
  showResultSkeleton?: boolean; // Show skeleton preview of expected results
  className?: string;
  // SSE streaming progress props (optional - overrides time-based animation)
  sseCurrentStep?: string | null;  // Current step ID from backend
  sseProgress?: number;            // Progress 0-100 from backend
}

// Loading spinner component
const LoadingSpinner = ({ size = "default" }: { size?: "default" | "large" }) => (
  <svg
    className={cn(
      "animate-spin",
      size === "large" ? "w-10 h-10" : "w-5 h-5"
    )}
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
);

// X icon for cancel button
const XIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// Result skeleton preview
function ResultSkeleton() {
  return (
    <div className="w-full max-w-sm space-y-4 animate-pulse">
      {/* Score skeleton */}
      <div className="p-3 rounded-lg bg-muted/50 space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="h-6 w-8 bg-muted rounded" />
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-2 w-12 bg-muted rounded" />
              <div className="flex-1 h-2 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
      {/* Rewrite skeleton */}
      <div className="p-3 rounded-lg bg-muted/50 space-y-2">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EnhancedProcessingSteps({
  steps,
  isActive,
  elapsedTime = 0,
  onCancel,
  isCancelling = false,
  cancelLabel = "キャンセル",
  showResultSkeleton = false,
  className,
  sseCurrentStep,
  sseProgress,
}: EnhancedProcessingStepsProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Determine if we're using SSE progress or time-based animation
  const useSSEProgress = sseCurrentStep !== undefined && sseCurrentStep !== null;

  // Calculate SSE-based step index
  const sseStepIndex = useSSEProgress
    ? steps.findIndex((s) => s.id === sseCurrentStep)
    : -1;

  // Use SSE step index if available, otherwise use time-based
  const effectiveStepIndex = useSSEProgress && sseStepIndex >= 0
    ? sseStepIndex
    : currentStepIndex;

  // Calculate total duration and current progress (for time-based fallback)
  const totalDuration = steps.reduce((acc, step) => acc + step.duration, 0);
  const elapsedDuration = steps
    .slice(0, currentStepIndex)
    .reduce((acc, step) => acc + step.duration, 0);
  const currentStepElapsed = Math.min(
    steps[currentStepIndex]?.duration || 0,
    (elapsedTime * 1000) - elapsedDuration
  );
  const calculatedProgress = Math.min(
    100,
    Math.round(((elapsedDuration + Math.max(0, currentStepElapsed)) / totalDuration) * 100)
  );

  // Use SSE progress if available, otherwise use calculated
  const progressPercentage = useSSEProgress && sseProgress !== undefined
    ? sseProgress
    : calculatedProgress;

  useEffect(() => {
    // Reset to first step when becoming inactive
    if (!isActive) {
      setCurrentStepIndex(0);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Skip time-based animation if using SSE progress
    if (useSSEProgress) {
      return;
    }

    // Auto-progress through steps (fallback for non-SSE)
    const currentStep = steps[currentStepIndex];
    if (!currentStep) return;

    timerRef.current = setTimeout(() => {
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      }
      // Stay on last step until isActive becomes false
    }, currentStep.duration);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, currentStepIndex, steps, useSSEProgress]);

  if (!isActive || steps.length === 0) {
    return null;
  }

  const currentStep = steps[effectiveStepIndex] || steps[steps.length - 1];

  return (
    <div className={cn("flex flex-col items-center justify-center py-8 space-y-5", className)}>
      {/* Spinner with gradient ring */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-primary/5 blur-xl" />
        <div className="relative text-primary">
          <LoadingSpinner size="large" />
        </div>
      </div>

      {/* Current step label with elapsed time */}
      <div className="space-y-3 text-center w-full max-w-xs">
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <p className="text-sm font-medium text-foreground animate-pulse">
              {isCancelling ? "キャンセル中..." : currentStep?.label}
            </p>
            {elapsedTime > 0 && !isCancelling && (
              <span className="text-xs text-muted-foreground">
                ({formatElapsedTime(elapsedTime)})
              </span>
            )}
          </div>
          {/* SubLabel for additional context */}
          {currentStep?.subLabel && !isCancelling && (
            <p className="text-xs text-muted-foreground">
              {currentStep.subLabel}
            </p>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full space-y-1.5">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isCancelling ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>ステップ {effectiveStepIndex + 1}/{steps.length}</span>
            <span>{progressPercentage}%</span>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index < effectiveStepIndex
                  ? "bg-primary" // Completed
                  : index === effectiveStepIndex
                  ? "bg-primary animate-pulse scale-125" // Current
                  : "bg-muted" // Pending
              )}
            />
          ))}
        </div>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          {isCancelling
            ? "処理を中断しています..."
            : "数秒〜数十秒かかる場合があります"}
        </p>
      </div>

      {/* Cancel button */}
      {onCancel && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isCancelling}
          className="text-muted-foreground hover:text-foreground"
          aria-label="添削をキャンセル"
        >
          <XIcon />
          {cancelLabel}
        </Button>
      )}

      {/* Result skeleton preview */}
      {showResultSkeleton && !isCancelling && (
        <div className="mt-4 pt-4 border-t border-border w-full">
          <p className="text-xs text-muted-foreground text-center mb-3">
            結果プレビュー
          </p>
          <ResultSkeleton />
        </div>
      )}
    </div>
  );
}

// Pre-defined step configurations for common use cases
// Enhanced with subLabels for better UX context
export const ES_REVIEW_STEPS: ProcessingStep[] = [
  {
    id: "analyze",
    label: "文章構造を分析中...",
    subLabel: "段落構成と論理展開をチェック",
    duration: 1500,
  },
  {
    id: "evaluate",
    label: "5軸で評価中...",
    subLabel: "論理性・具体性・熱意・企業接続・可読性",
    duration: 2000,
  },
  {
    id: "identify",
    label: "改善点を特定中...",
    subLabel: "優先度の高い3点を抽出",
    duration: 2000,
  },
  {
    id: "generate",
    label: "リライトを生成中...",
    subLabel: "3パターン作成",
    duration: 1500,
  },
];

export default EnhancedProcessingSteps;
