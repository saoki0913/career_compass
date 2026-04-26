"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCredits } from "@/hooks/useCredits";
import { signOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface SidebarUserMenuProps {
  collapsed: boolean;
}

const PLAN_BADGE_STYLES: Record<string, string> = {
  guest: "bg-muted text-muted-foreground",
  free: "bg-muted text-muted-foreground",
  standard: "bg-primary/10 text-primary",
  pro: "bg-accent/10 text-accent-foreground",
};

function UserIcon() {
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
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx={12} cy={7} r={4} />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function CogMenuIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <circle cx={12} cy={12} r={3} />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={1} y={4} width={22} height={16} rx={2} ry={2} />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

export function SidebarUserMenu({ collapsed }: SidebarUserMenuProps) {
  const { user, isGuest, isAuthenticated, isReady } = useAuth();
  const { plan } = useCredits({ isAuthenticated, isAuthReady: isReady });

  const displayName = user?.name ?? user?.email ?? "ゲスト";
  const initial = displayName.charAt(0).toUpperCase();
  const planKey = plan ?? "guest";
  const planBadgeStyle = PLAN_BADGE_STYLES[planKey] ?? PLAN_BADGE_STYLES.free;
  const planLabel = planKey.charAt(0).toUpperCase() + planKey.slice(1);

  const avatar = (
    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-accent text-sidebar-foreground text-sm font-semibold">
      {user?.image ? (
        <Image
          src={user.image}
          alt={displayName}
          referrerPolicy="no-referrer"
          width={32}
          height={32}
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );

  const menuContent = (
    <PopoverContent side="right" align="end" className="w-56 p-1">
      <div className="px-2 py-1.5 mb-1">
        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
        {user?.email && (
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        )}
      </div>
      <div className="h-px bg-border my-1" />
      <Link
        href="/settings/profile"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-sidebar-accent transition-colors"
      >
        <UserIcon />
        プロフィール
      </Link>
      <Link
        href="/settings"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-sidebar-accent transition-colors"
      >
        <CogMenuIcon />
        設定
      </Link>
      <Link
        href="/pricing"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-sidebar-accent transition-colors"
      >
        <CreditCardIcon />
        プラン / クレジット
      </Link>
      <div className="h-px bg-border my-1" />
      <button
        type="button"
        onClick={() => signOut()}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
      >
        <LogOutIcon />
        ログアウト
      </button>
    </PopoverContent>
  );

  if (!isReady) {
    return (
      <div
        className={cn(
          "flex items-center",
          collapsed ? "h-10 w-10 justify-center mx-auto" : "h-10 px-3 gap-3",
        )}
      >
        <span className="h-8 w-8 rounded-full bg-sidebar-accent animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated && !isGuest) {
    return (
      <Link
        href="/login"
        className={cn(
          "group relative flex items-center rounded-lg transition-colors hover:bg-sidebar-accent/60",
          collapsed ? "h-10 w-10 justify-center mx-auto" : "h-10 px-3 gap-3",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground">
          <UserIcon />
        </span>
        {!collapsed && (
          <span className="truncate text-sm font-medium text-sidebar-foreground">
            ログイン
          </span>
        )}
        {collapsed && (
          <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
            ログイン
          </span>
        )}
      </Link>
    );
  }

  if (collapsed) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="group relative flex h-10 w-10 items-center justify-center mx-auto rounded-lg transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label={displayName}
          >
            {avatar}
            <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              {displayName}
            </span>
          </button>
        </PopoverTrigger>
        {menuContent}
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label={displayName}
        >
          {avatar}
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="truncate text-sm font-medium text-sidebar-foreground leading-tight">
              {displayName}
            </span>
          </span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold leading-none",
              planBadgeStyle,
            )}
          >
            {planLabel}
          </span>
        </button>
      </PopoverTrigger>
      {menuContent}
    </Popover>
  );
}
