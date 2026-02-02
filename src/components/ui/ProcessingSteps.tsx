"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * ProcessingSteps Component
 * UX Psychology: Labor Illusion - Shows visible work being done to increase perceived value
 *
 * This component displays a sequence of processing steps with automatic progression,
 * making users feel that meaningful work is being performed behind the scenes.
 */

export interface ProcessingStep {
  id: string;
  label: string;
  duration: number; // Display duration in milliseconds
}

interface ProcessingStepsProps {
  steps: ProcessingStep[];
  isActive: boolean;
  className?: string;
}

// Loading spinner component
const LoadingSpinner = ({ size = "default" }: { size?: "default" | "large" }) => (
  <svg
    className={cn(
      "animate-spin",
      size === "large" ? "w-8 h-8" : "w-5 h-5"
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

export function ProcessingSteps({ steps, isActive, className }: ProcessingStepsProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

    // Auto-progress through steps
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
  }, [isActive, currentStepIndex, steps]);

  if (!isActive || steps.length === 0) {
    return null;
  }

  const currentStep = steps[currentStepIndex];

  return (
    <div className={cn("flex flex-col items-center justify-center py-8 space-y-4", className)}>
      {/* Spinner */}
      <div className="text-primary">
        <LoadingSpinner size="large" />
      </div>

      {/* Current step label */}
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-foreground animate-pulse">
          {currentStep?.label}
        </p>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-300",
                index < currentStepIndex
                  ? "bg-primary" // Completed
                  : index === currentStepIndex
                  ? "bg-primary animate-pulse" // Current
                  : "bg-muted" // Pending
              )}
            />
          ))}
        </div>

        {/* Helper text */}
        <p className="text-xs text-muted-foreground">
          数秒〜数十秒かかる場合があります
        </p>
      </div>
    </div>
  );
}

// Pre-defined step configurations for common use cases

export const ES_REVIEW_STEPS: ProcessingStep[] = [
  { id: "analyze", label: "文章を分析中...", duration: 1500 },
  { id: "evaluate", label: "評価ポイントを確認中...", duration: 2000 },
  { id: "identify", label: "改善点を特定中...", duration: 2000 },
  { id: "generate", label: "リライト案を生成中...", duration: 1500 },
];

export const COMPANY_FETCH_STEPS: ProcessingStep[] = [
  { id: "search", label: "採用ページを検索中...", duration: 1500 },
  { id: "analyze", label: "ページを解析中...", duration: 2000 },
  { id: "extract", label: "締切情報を抽出中...", duration: 1500 },
  { id: "verify", label: "情報を検証中...", duration: 1000 },
];

export const GAKUCHIKA_STEPS: ProcessingStep[] = [
  { id: "understand", label: "内容を理解中...", duration: 1500 },
  { id: "analyze", label: "深掘りポイントを分析中...", duration: 2000 },
  { id: "generate", label: "質問を生成中...", duration: 1500 },
];

export default ProcessingSteps;
