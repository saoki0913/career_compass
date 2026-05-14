"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCredits } from "@/hooks/useCredits";
import { getCreditLowThreshold } from "@/lib/billing/plan-metadata";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SidebarCreditsProps {
  collapsed: boolean;
}

function CoinIcon({ className }: { className?: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("text-sidebar-primary", className)}
      aria-hidden="true"
    >
      <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function formatResetDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()} リセット`;
}

export function SidebarCredits({ collapsed }: SidebarCreditsProps) {
  const { isAuthenticated, isReady } = useAuth();
  const { balance, monthlyAllocation, plan, nextResetAt, isLoading, error, refresh } = useCredits({
    isAuthenticated,
    isAuthReady: isReady,
  });

  const balanceDisplay = isLoading ? "…" : error ? "---" : balance.toLocaleString();
  const threshold = getCreditLowThreshold(monthlyAllocation);
  const isDepleted = !isLoading && !error && balance === 0;
  const isLow = !isLoading && !error && balance > 0 && balance <= threshold;
  const planLabel = plan === "guest" ? "" : plan === "free" ? "Free" : plan === "standard" ? "Standard" : plan === "pro" ? "Pro" : "";
  const tooltipText = isDepleted
    ? "クレジット不足 — プランを確認"
    : nextResetAt
      ? `${planLabel ? planLabel + " " : ""}クレジット残高 (${formatResetDate(nextResetAt)})`
      : `${planLabel ? planLabel + " " : ""}クレジット残高`;

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="group relative flex h-10 w-10 flex-col items-center justify-center mx-auto rounded-lg transition-colors hover:bg-sidebar-accent/60">
              <CoinIcon className={cn("mb-0.5", isDepleted && "text-destructive", isLow && "text-amber-600")} />
              {error ? (
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="text-[10px] font-semibold tabular-nums text-destructive leading-none"
                  aria-label="クレジット再取得"
                >
                  ---
                </button>
              ) : (
                <span className={cn(
                  "text-[10px] font-semibold tabular-nums leading-none",
                  isDepleted ? "text-destructive" : isLow ? "text-amber-600" : "text-sidebar-primary"
                )}>
                  {balanceDisplay}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={isDepleted ? "/pricing?source=sidebar&reason=depleted" : "/pricing"}
            className="group flex w-full items-center gap-3 rounded-lg px-3 transition-colors hover:bg-sidebar-accent/60 min-h-[2.5rem]"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              <CoinIcon className={cn("h-4 w-4", isDepleted && "text-destructive", isLow && "text-amber-600")} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              {error ? (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); refresh(); }}
                  className="text-left text-sm font-semibold text-destructive"
                >
                  {balanceDisplay}
                </button>
              ) : (
                <>
                  <span className={cn(
                    "truncate text-sm font-semibold tabular-nums",
                    isDepleted ? "text-destructive" : isLow ? "text-amber-600" : "text-sidebar-primary"
                  )}>
                    {isDepleted ? "0 — 補充 →" : balanceDisplay}
                  </span>
                  {planLabel && !isLoading ? (
                    <span className="truncate text-[10px] leading-tight text-sidebar-foreground/50">
                      {planLabel} / {monthlyAllocation}
                      {isLow ? " · 残りわずか" : ""}
                    </span>
                  ) : null}
                </>
              )}
            </span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
