"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { ProductBackButton } from "@/components/shared/ProductBackButton";
import {
  PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET,
  PRODUCT_PAGE_TITLE_CLASS,
} from "@/components/shared/product-page-header-layout";
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
  titleExtra,
  actionBar,
  headerActions,
  mobileStatus,
  conversation,
  conversationFooter,
  composer,
  sidebar,
}: {
  backHref?: string;
  backLabel?: string;
  title: string;
  subtitle?: string | null;
  titleExtra?: ReactNode;
  actionBar?: ReactNode;
  headerActions?: HeaderAction[];
  mobileStatus?: ReactNode;
  conversation: ReactNode;
  conversationFooter?: ReactNode;
  composer?: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <main className="mx-auto flex w-full max-w-[96rem] flex-1 flex-col overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-8">
        <div className={cn("mb-4 flex shrink-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between", PRODUCT_PAGE_HEADER_SIDEBAR_OFFSET)}>
          <div className="flex min-w-0 items-start gap-3">
            {backHref ? <ProductBackButton href={backHref} label={backLabel || "戻る"} /> : null}
            <div className="min-w-0 pt-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className={cn(PRODUCT_PAGE_TITLE_CLASS, "truncate")}>{title}</h1>
                {subtitle ? (
                  <>
                    <div className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/30 lg:block" />
                    <p className="hidden max-w-[18rem] truncate text-sm text-muted-foreground lg:block xl:max-w-[22rem]">{subtitle}</p>
                  </>
                ) : null}
                {titleExtra ? <div className="shrink-0">{titleExtra}</div> : null}
              </div>
              {subtitle ? <p className="mt-0.5 max-w-full truncate text-sm text-muted-foreground lg:hidden">{subtitle}</p> : null}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 xl:max-w-[820px] xl:items-end">
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

        <div className="grid grid-cols-1 gap-3.5 flex-1 overflow-hidden xl:grid-cols-[minmax(0,1.9fr)_minmax(280px,0.7fr)] 2xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,0.65fr)]">
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card">
            {mobileStatus ? (
              <div className="border-b border-border/50 px-3 py-3 sm:px-4 xl:hidden">{mobileStatus}</div>
            ) : null}
            <div className="flex-1 overflow-y-auto px-3 pt-3 sm:px-4 sm:pt-4 xl:pb-4">
              {conversation}
            </div>
            {conversationFooter ? (
              <div className="max-h-[48dvh] shrink-0 overflow-y-auto border-t border-border/50 p-3 sm:px-4 sm:pt-4 xl:max-h-[52dvh]">
                {conversationFooter}
              </div>
            ) : null}
            {composer ? (
              <div className="shrink-0 border-t border-border/50 p-3 sm:px-4 sm:pt-4 max-xl:pb-3 xl:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
                {composer}
              </div>
            ) : null}
          </div>

          <div className="hidden space-y-3 xl:flex xl:min-h-0 xl:flex-col xl:space-y-0">
            <div className="space-y-3 xl:flex-1 xl:overflow-y-auto xl:pr-1">{sidebar}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
