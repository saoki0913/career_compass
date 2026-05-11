"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { AppSidebar, SIDEBAR_WIDTH_EXPANDED, SIDEBAR_WIDTH_COLLAPSED } from "./AppSidebar";

function SidebarToggleIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={3} y={3} width={18} height={18} rx={2} />
      <path d="M9 3v18" />
    </svg>
  );
}

function MobileSidebarToggle() {
  const { isOpen, setOpen } = useSidebar();
  if (isOpen) return null;
  return (
    <button
      type="button"
      className="fixed top-[max(0.75rem,env(safe-area-inset-top,0.75rem))] left-3 z-20 flex h-11 w-11 items-center justify-center rounded-lg border border-border/40 bg-background/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted lg:hidden"
      onClick={() => setOpen(true)}
      aria-label="サイドバーを開く"
    >
      <SidebarToggleIcon />
    </button>
  );
}

function LayoutInner({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRouteKey = `${pathname}?${searchParams.toString()}`;
  const [pendingRouteKey, setPendingRouteKey] = useState<string | null>(null);
  const isRoutePending = pendingRouteKey !== null && pendingRouteKey !== currentRouteKey;
  const sidebarWidth = isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  useEffect(() => {
    if (!isRoutePending) return;
    const timer = window.setTimeout(() => setPendingRouteKey(null), 8_000);
    return () => window.clearTimeout(timer);
  }, [isRoutePending]);

  function handleShellClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(target instanceof HTMLAnchorElement)) {
      return;
    }
    if (target.target || target.hasAttribute("download")) {
      return;
    }
    const nextUrl = new URL(target.href, window.location.href);
    if (nextUrl.origin !== window.location.origin) {
      return;
    }
    const nextRouteKey = `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`;
    if (nextRouteKey !== currentRouteKey) {
      setPendingRouteKey(nextRouteKey);
    }
  }

  return (
    <div onClick={handleShellClick}>
      <AppSidebar />
      <MobileSidebarToggle />
      <div
        className="min-h-screen transition-[margin-left,width] duration-200 ease-in-out lg:ml-[var(--sidebar-width)] lg:w-[calc(100vw_-_var(--sidebar-width))]"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {isRoutePending && (
          <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-primary/20">
            <div className="h-full w-1/2 animate-pulse bg-primary" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

interface ProductLayoutClientProps {
  children: ReactNode;
  initialCollapsed?: boolean;
}

export function ProductLayoutClient({ children, initialCollapsed }: ProductLayoutClientProps) {
  return (
    <SidebarProvider initialCollapsed={initialCollapsed}>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
