"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActivationProgress, ActivationStepId } from "@/hooks/useActivation";
import { trackEvent } from "@/lib/analytics/client";

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={cn("w-4 h-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

const CircleIcon = ({ className }: { className?: string }) => (
  <svg className={cn("w-4 h-4", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
  </svg>
);

const ORDER: ActivationStepId[] = ["company", "deadline", "es", "ai_review"];

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
    <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base sm:text-lg">はじめにやること</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {progress.completedSteps === progress.totalSteps
                ? "完了しました。おつかれさまです。"
                : `あと ${progress.totalSteps - progress.completedSteps} つで準備完了`}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-primary">{pct}%</p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {steps.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-background/60 p-4 hover:bg-background/80 transition-colors",
                s.done && "opacity-70"
              )}
            >
              <div className={cn("mt-0.5", s.done ? "text-success" : "text-muted-foreground")}>
                {s.done ? <CheckIcon /> : <CircleIcon />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  現在: {s.count.toLocaleString()}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {progress.nextAction ? (
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              次のおすすめ: <span className="font-medium text-foreground">{progress.nextAction.label}</span>
            </p>
            <Button asChild>
              <Link href={progress.nextAction.href}>{progress.nextAction.label}</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

