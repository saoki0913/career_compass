"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/SidebarContext";
import {
  SidebarUserMenu,
  SidebarNotifications,
  SidebarCredits,
  SidebarSearch,
} from "@/components/layout/sidebar";

const CompanySelectModal = dynamic(() =>
  import("@/components/dashboard/CompanySelectModal").then((mod) => mod.CompanySelectModal)
);

export const SIDEBAR_WIDTH_EXPANDED = 256;
export const SIDEBAR_WIDTH_COLLAPSED = 48;

const LG_BREAKPOINT = 1024;

function subscribeHydration() {
  return () => {};
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

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

function HomeIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" />
    </svg>
  );
}

function BookOpenIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 11a7 7 0 01-14 0m7 8v3m-4 0h8" />
      <rect x={9} y={2} width={6} height={12} rx={3} />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx={12} cy={12} r={10} />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function CheckSquareIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function CogIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  icon: React.ComponentType;
  action:
    | { type: "link"; href: string }
    | { type: "modal"; modal: "interview" | "motivation" };
}

const NAV_ITEMS: NavItem[] = [
  { label: "ホーム", action: { type: "link", href: "/dashboard" }, icon: HomeIcon },
  { label: "企業管理", action: { type: "link", href: "/companies" }, icon: BuildingIcon },
  { label: "ES添削", action: { type: "link", href: "/es" }, icon: FileTextIcon },
  { label: "志望動機作成", action: { type: "modal", modal: "motivation" }, icon: HeartIcon },
  { label: "ガクチカ", action: { type: "link", href: "/gakuchika" }, icon: BookOpenIcon },
  { label: "面接対策", action: { type: "modal", modal: "interview" }, icon: MicIcon },
  { label: "カレンダー", action: { type: "link", href: "/calendar" }, icon: CalendarIcon },
  { label: "締切管理", action: { type: "link", href: "/deadlines" }, icon: ClockIcon },
  { label: "タスク", action: { type: "link", href: "/tasks" }, icon: CheckSquareIcon },
  { label: "設定", action: { type: "link", href: "/settings" }, icon: CogIcon },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppSidebar() {
  const pathname = usePathname();
  const { isOpen, isCollapsed, setOpen, collapse, expand } = useSidebar();
  const collapsed = isCollapsed;

  const hydrated = useSyncExternalStore(
    subscribeHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showMotivationModal, setShowMotivationModal] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname, setOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setOpen]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= LG_BREAKPOINT && isOpen) setOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isOpen, setOpen]);

  function isActive(item: NavItem): boolean {
    if (item.action.type !== "link") return false;
    if (item.action.href === "/dashboard") return pathname === "/dashboard";
    return pathname === item.action.href || pathname.startsWith(item.action.href + "/");
  }

  function handleModalAction(modal: "interview" | "motivation") {
    setOpen(false);
    if (modal === "interview") {
      setShowInterviewModal(true);
      return;
    }
    setShowMotivationModal(true);
  }

  function renderSidebarContent(isMobile: boolean) {
    const isCol = isMobile ? false : collapsed;
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-sidebar-border",
            isCol ? "justify-center px-1" : "justify-between px-3",
          )}
        >
          {isCol ? (
            <button
              type="button"
              onClick={expand}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="サイドバーを開く"
            >
              <SidebarToggleIcon />
            </button>
          ) : (
            <>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label="就活Pass - ホーム"
              >
                <img src="/icon.png" alt="就活Pass" width={28} height={28} className="h-7 w-7 rounded-lg" />
                <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
                  就活Pass
                </span>
              </Link>
              <button
                type="button"
                onClick={isMobile ? () => setOpen(false) : collapse}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-label={isMobile ? "サイドバーを閉じる" : "サイドバーを閉じる"}
              >
                {isMobile ? <CloseIcon /> : <SidebarToggleIcon />}
              </button>
            </>
          )}
        </div>

        {/* Search */}
        <div className={cn("shrink-0 px-2 pt-2", isCol && "px-1")}>
          <SidebarSearch collapsed={isCol} onNavigate={() => setOpen(false)} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="メインナビゲーション">
          <ul className="flex flex-col gap-0.5" role="list">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;

              const content = (
                <>
                  <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center", active ? "text-sidebar-primary" : "text-muted-foreground")}>
                    <Icon />
                  </span>
                  {!isCol && (
                    <span className={cn("truncate text-sm", active ? "font-semibold text-sidebar-primary" : "font-medium text-sidebar-foreground")}>
                      {item.label}
                    </span>
                  )}
                </>
              );

              const itemClassName = cn(
                "group relative flex items-center gap-3 rounded-lg transition-colors duration-150",
                isCol ? "h-9 w-9 justify-center mx-auto" : "h-9 px-3",
                active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              );

              const activeIndicator = active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sidebar-primary" aria-hidden="true" />
              );

              const tooltip = isCol && (
                <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100" role="tooltip">
                  {item.label}
                </span>
              );

              if (item.action.type === "link") {
                return (
                  <li key={item.label} className="relative">
                    <Link href={item.action.href} className={itemClassName} aria-current={active ? "page" : undefined}>
                      {activeIndicator}
                      {content}
                      {tooltip}
                    </Link>
                  </li>
                );
              }

              const modal = item.action.modal;
              return (
                <li key={item.label} className="relative">
                  <button
                    type="button"
                    onClick={() => handleModalAction(modal)}
                    className={cn(itemClassName, "w-full cursor-pointer")}
                  >
                    {activeIndicator}
                    {content}
                    {tooltip}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div className={cn("shrink-0 border-t border-sidebar-border", isCol ? "px-1 py-2" : "px-2 py-2")}>
          <div className="flex flex-col gap-0.5">
            <SidebarNotifications collapsed={isCol} />
            <SidebarCredits collapsed={isCol} />
            <SidebarUserMenu collapsed={isCol} />
          </div>
        </div>
      </div>
    );
  }

  if (!hydrated) return null;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar shadow-xl transition-transform duration-200 ease-in-out lg:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="サイドバーナビゲーション"
      >
        {renderSidebarContent(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 z-40",
          "border-r border-sidebar-border bg-sidebar",
          "transition-[width] duration-200 ease-in-out",
        )}
        aria-label="サイドバーナビゲーション"
      >
        {renderSidebarContent(false)}
      </aside>

      <CompanySelectModal
        open={showInterviewModal}
        onOpenChange={setShowInterviewModal}
        mode="interview"
      />
      <CompanySelectModal
        open={showMotivationModal}
        onOpenChange={setShowMotivationModal}
        mode="motivation"
      />
    </>
  );
}
