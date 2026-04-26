"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useNotifications, NOTIFICATION_TYPE_ICONS } from "@/hooks/useNotifications";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface SidebarNotificationsProps {
  collapsed: boolean;
}

function BellIcon() {
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
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

export function SidebarNotifications({ collapsed }: SidebarNotificationsProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications({ limit: 5 });

  const trigger = collapsed ? (
    <button
      type="button"
      className="group relative flex h-10 w-10 items-center justify-center mx-auto rounded-lg transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      aria-label="通知"
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-2 w-2 rounded-full bg-destructive" />
        )}
      </span>
      <span className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        通知{unreadCount > 0 ? ` (${unreadCount})` : ""}
      </span>
    </button>
  ) : (
    <button
      type="button"
      className="group flex h-10 w-full items-center gap-3 rounded-lg px-3 transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      aria-label="通知"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <BellIcon />
      </span>
      <span className="flex-1 truncate text-sm font-medium text-sidebar-foreground">
        通知
      </span>
      {unreadCount > 0 && (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">通知</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="text-xs text-primary hover:underline"
            >
              すべて既読にする
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            通知はありません
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => { if (!n.isRead) markAsRead(n.id); }}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-sidebar-accent/60",
                    !n.isRead && "bg-primary/5",
                  )}
                >
                  <span className="shrink-0 text-base leading-none mt-0.5" aria-hidden="true">
                    {NOTIFICATION_TYPE_ICONS[n.type] ?? ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground leading-snug">
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {n.message}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border">
          <Link
            href="/notifications"
            className="flex w-full items-center justify-center py-3 text-sm font-medium text-primary hover:bg-sidebar-accent/60 transition-colors"
          >
            すべての通知を見る
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
