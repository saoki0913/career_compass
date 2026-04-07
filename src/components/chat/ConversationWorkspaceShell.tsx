"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HeaderAction =
  | {
      kind: "link";
      label: string;
      href: string;
      variant?: "outline" | "ghost";
    }
  | {
      kind: "button";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      variant?: "outline" | "ghost";
    };

function BackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

export function ConversationSidebarCard({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/50 bg-card", className)}>
      <div className="flex min-h-12 flex-row items-center justify-between gap-3 px-3.5 py-2.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {actions}
      </div>
      <div className="px-3.5 pb-3.5 pt-0">{children}</div>
    </div>
  );
}

export function ConversationWorkspaceShell({
  backHref,
  backLabel,
  title,
  subtitle,
  actionBar,
  headerActions,
  mobileStatus,
  conversation,
  composer,
  sidebar,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  subtitle?: string | null;
  actionBar?: ReactNode;
  headerActions?: HeaderAction[];
  mobileStatus?: ReactNode;
  conversation: ReactNode;
  composer?: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-center gap-3">
            {backHref ? (
              <Link
                href={backHref}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 transition-colors hover:bg-secondary"
                aria-label={backLabel || "戻る"}
              >
                <BackIcon />
              </Link>
            ) : null}
            <div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-bold">{title}</h1>
                {subtitle ? (
                  <>
                    <div className="hidden h-1.5 w-1.5 rounded-full bg-muted-foreground/30 lg:block" />
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 xl:max-w-[760px] xl:items-end">
            {headerActions && headerActions.length > 0 ? (
              <div className="flex w-full flex-wrap items-center justify-end gap-2">
                {headerActions.map((action) =>
                  action.kind === "link" ? (
                    <Button key={`${action.kind}-${action.label}`} variant={action.variant ?? "outline"} asChild>
                      <Link href={action.href}>{action.label}</Link>
                    </Button>
                  ) : (
                    <Button
                      key={`${action.kind}-${action.label}`}
                      variant={action.variant ?? "ghost"}
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      {action.label}
                    </Button>
                  ),
                )}
              </div>
            ) : null}
            {actionBar}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.75fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
            {mobileStatus ? (
              <div className="border-b border-border/50 px-3 py-3 sm:px-4 lg:hidden">{mobileStatus}</div>
            ) : null}
            <div className="flex-1 overflow-y-auto px-3 pt-3 sm:px-4 sm:pt-4 lg:pb-4">
              {conversation}
            </div>
            {composer ? (
              <div className="shrink-0 border-t border-border/50 p-3 sm:px-4 sm:pt-4 max-lg:pb-[calc(0.75rem+var(--mobile-bottom-nav-offset))] lg:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                {composer}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0">
            <div className="space-y-3 lg:flex-1 lg:overflow-y-auto lg:pr-1">{sidebar}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
