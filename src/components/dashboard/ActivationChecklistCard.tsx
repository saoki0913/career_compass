"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActivationProgress, ActivationStepId } from "@/hooks/useActivation";
import { trackEvent } from "@/lib/analytics/client";

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={cn("w-3.5 h-3.5", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

const CircleIcon = ({ className }: { className?: string }) => (
  <svg className={cn("w-3.5 h-3.5", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
  </svg>
);

const ORDER: ActivationStepId[] = ["company", "deadline", "es", "ai_review"];

const SHORT_LABELS: Record<ActivationStepId, string> = {
  company: "企業",
  deadline: "締切",
  es: "ES",
  ai_review: "AI添削",
};

export function ActivationChecklistCard({
  progress,
}: {
  progress: ActivationProgress;
}) {
  const lastTracked = useRef<string | null>(null);

  const steps = useMemo(() => {
    return ORDER.map((id) => ({ id, ...progress.steps[id] }));
  }, [progress]);

  const pct = progress.totalSteps > 0 ? Math.round((progress.completedSteps / progress.totalSteps) * 100) : 0;

  useEffect(() => {
    const key = `${progress.completedSteps}/${progress.totalSteps}`;
    if (lastTracked.current === key) return;
    lastTracked.current = key;
    trackEvent("activation_checklist_progress", {
      completed: progress.completedSteps,
      total: progress.totalSteps,
    });
  }, [progress.completedSteps, progress.totalSteps]);

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-accent/5 px-4 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Title + Progress */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold">はじめにやること</span>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-semibold tabular-nums text-primary">{pct}%</span>
          </div>
        </div>

        {/* Steps (horizontal) */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap flex-1">
          {steps.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className={cn(
                "flex items-center gap-1.5 text-xs hover:text-primary transition-colors",
                s.done ? "text-muted-foreground" : "text-foreground font-medium"
              )}
            >
              <span className={s.done ? "text-success" : "text-muted-foreground"}>
                {s.done ? <CheckIcon /> : <CircleIcon />}
              </span>
              {SHORT_LABELS[s.id]}
            </Link>
          ))}
        </div>

        {/* Next Action */}
        {progress.nextAction && (
          <Button size="sm" className="h-7 text-xs flex-shrink-0" asChild>
            <Link href={progress.nextAction.href}>{progress.nextAction.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
