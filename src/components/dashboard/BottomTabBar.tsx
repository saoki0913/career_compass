"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg className="w-5 h-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const BuildingIcon = ({ active }: { active: boolean }) => (
  <svg className="w-5 h-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const DocumentIcon = ({ active }: { active: boolean }) => (
  <svg className="w-5 h-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ChatIcon = ({ active }: { active: boolean }) => (
  <svg className="w-5 h-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const CalendarIcon = ({ active }: { active: boolean }) => (
  <svg className="w-5 h-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const NAV_ITEMS = [
  { href: "/dashboard", label: "ホーム", Icon: HomeIcon },
  { href: "/companies", label: "企業", Icon: BuildingIcon },
  { href: "/es", label: "ES", Icon: DocumentIcon },
  { href: "/gakuchika", label: "ガクチカ", Icon: ChatIcon },
  { href: "/calendar", label: "カレンダー", Icon: CalendarIcon },
] as const;

export function BottomTabBar() {
  const pathname = usePathname();

  // Don't show on auth pages or landing page
  if (!pathname || pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup")) {
    return null;
  }

  return (
    <>
      {/* Spacer to prevent content from being hidden behind fixed bottom nav */}
      <div className="h-16 lg:hidden" />
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-border/40 bg-background/80 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="メインナビゲーション"
      >
        <div className="flex items-center justify-around h-16 px-1">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 w-full h-full min-w-[44px] min-h-[44px] rounded-lg transition-colors duration-200",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon active={isActive} />
                <span className={cn(
                  "text-[10px] leading-tight",
                  isActive ? "font-semibold" : "font-medium"
                )}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
