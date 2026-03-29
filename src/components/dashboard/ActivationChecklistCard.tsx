"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActivationProgress, ActivationStepId } from "@/hooks/useActivation";
import { trackEvent } from "@/lib/analytics/client";

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={cn("h-3.5 w-3.5", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

const CircleIcon = ({ className }: { className?: string }) => (
  <svg className={cn("h-3.5 w-3.5", className)} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
  </svg>
);

const ORDER: ActivationStepId[] = ["company", "motivation", "profile"];

const SHORT_LABELS: Record<ActivationStepId, string> = {
  company: "企業",
  motivation: "志望動機",
  profile: "保存",
};

export function ActivationChecklistCard({
  progress,
  muted = false,
  isGuest = false,
}: {
  progress: ActivationProgress;
  muted?: boolean;
  isGuest?: boolean;
}) {
  const lastTracked = useRef<string | null>(null);

  const steps = useMemo(() => ORDER.map((id) => ({ id, ...progress.steps[id] })), [progress]);
  const pct = progress.totalSteps > 0 ? Math.round((progress.completedSteps / progress.totalSteps) * 100) : 0;
  const nextStep = steps.find((step) => !step.done) ?? null;

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
    <div
      className={cn(
        "mb-6 rounded-2xl border p-5 transition-colors",
        muted
          ? "border-border/70 bg-muted/30"
          : "border-primary/20 bg-gradient-to-br from-primary/8 via-background to-accent/5"
      )}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              最初の一歩
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              1社登録して、最初の志望動機をAIで作り始めましょう
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              就活Passは、最初に企業を登録すると次の作業がはっきりします。
              {isGuest
                ? " まずはゲストで試し、続けるときにログインして進捗を引き継げます。"
                : " AI体験のあとでプロフィールを整える流れにして、初回の離脱を減らします。"}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-semibold tabular-nums text-primary">{pct}%</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {progress.completedSteps}/{progress.totalSteps} 完了
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                "rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-background/80",
                step.done ? "border-border/70 bg-background/60 text-muted-foreground" : "border-primary/15 bg-background/90"
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    step.done ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {step.done ? <CheckIcon /> : <CircleIcon />}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {SHORT_LABELS[step.id]}
                  </p>
                  <p className={cn("mt-1 text-sm font-medium", !step.done && "text-foreground")}>{step.label}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {nextStep ? `次は「${nextStep.label}」に進めば、使える状態まで最短です。` : "初回セットアップは完了しています。"}
          </div>
          {progress.nextAction ? (
            <Button className="sm:min-w-56" asChild>
              <Link href={progress.nextAction.href}>{progress.nextAction.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
