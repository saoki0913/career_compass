"use client";

import type { CSSProperties, ReactNode } from "react";
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
      className="fixed top-3 left-3 z-20 flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 bg-background/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted lg:hidden"
      onClick={() => setOpen(true)}
      aria-label="サイドバーを開く"
    >
      <SidebarToggleIcon />
    </button>
  );
}

function LayoutInner({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();
  const sidebarWidth = isCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  return (
    <>
      <AppSidebar />
      <MobileSidebarToggle />
      <div
        className="min-h-screen transition-[margin-left] duration-200 ease-in-out lg:ml-[var(--sidebar-width)]"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {children}
      </div>
    </>
  );
}

export function ProductLayoutClient({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
