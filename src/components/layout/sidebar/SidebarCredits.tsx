"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCredits } from "@/hooks/useCredits";

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
  const { balance, nextResetAt, isLoading, error, refresh } = useCredits({
    isAuthenticated,
    isAuthReady: isReady,
  });

  const balanceDisplay = isLoading ? "…" : error ? "---" : balance.toLocaleString();
  const tooltipText = nextResetAt
    ? `クレジット残高 (${formatResetDate(nextResetAt)})`
    : "クレジット残高";

  if (collapsed) {
    return (
      <div className="group relative flex h-10 w-10 flex-col items-center justify-center mx-auto rounded-lg transition-colors hover:bg-sidebar-accent/60">
        <CoinIcon className="mb-0.5" />
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
          <span className="text-[10px] font-semibold tabular-nums text-sidebar-primary leading-none">
            {balanceDisplay}
          </span>
        )}
        <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
          {tooltipText}
        </span>
      </div>
    );
  }

  return (
    <Link
      href="/pricing"
      className="group flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-colors hover:bg-sidebar-accent/60"
      title={tooltipText}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <CoinIcon className="h-4 w-4" />
      </span>
      {error ? (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); refresh(); }}
          className="flex-1 text-left text-sm font-semibold text-destructive"
        >
          {balanceDisplay}
        </button>
      ) : (
        <span className="flex-1 truncate text-sm font-semibold tabular-nums text-sidebar-primary">
          {balanceDisplay}
        </span>
      )}
    </Link>
  );
}
