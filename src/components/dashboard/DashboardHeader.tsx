"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import Link from "next/link";
import { useNotifications, NOTIFICATION_TYPE_ICONS } from "@/hooks/useNotifications";
import { SearchBar } from "@/components/search";
import { cn } from "@/lib/utils";

const BellIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

export function DashboardHeader() {
  const { user, isGuest } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications({ limit: 5 });
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm shadow-primary/20 group-hover:shadow-md group-hover:shadow-primary/30 transition-all duration-200">
                <span className="text-primary-foreground font-bold text-sm">U</span>
              </div>
              <span className="font-bold text-lg tracking-tight">ウカルン</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-all duration-200 cursor-pointer"
              >
                ダッシュボード
              </Link>
              <Link
                href="/companies"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer"
              >
                企業管理
              </Link>
              <Link
                href="/es"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer"
              >
                ES作成
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {/* Search Bar */}
            <SearchBar />

            {/* Notification Bell */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="relative p-2 rounded-lg hover:bg-secondary transition-all duration-200 cursor-pointer"
                aria-label="通知"
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {showDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
                    <span className="font-medium">通知</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllAsRead()}
                        className="text-xs text-primary hover:underline cursor-pointer transition-colors duration-200"
                      >
                        すべて既読にする
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <p className="text-sm">通知はありません</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            if (!notification.isRead) {
                              markAsRead(notification.id);
                            }
                          }}
                          className={cn(
                            "w-full px-4 py-3 text-left hover:bg-muted/50 transition-all duration-200 cursor-pointer border-b border-border/30 last:border-0",
                            !notification.isRead && "bg-primary/5"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0">
                              {NOTIFICATION_TYPE_ICONS[notification.type]}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm font-medium", !notification.isRead && "text-primary")}>
                                {notification.title}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {notification.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(notification.createdAt).toLocaleDateString("ja-JP", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border/50">
                    <Link
                      href="/notifications"
                      onClick={() => setShowDropdown(false)}
                      className="block w-full py-3 text-center text-sm text-primary font-medium hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                    >
                      すべての通知を見る
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {isGuest ? (
              <Button asChild size="sm">
                <Link href="/login">ログイン</Link>
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2">
                  {user?.image && (
                    <img
                      src={user.image}
                      alt=""
                      className="w-8 h-8 rounded-full ring-2 ring-background"
                    />
                  )}
                  <span className="text-sm font-medium">{user?.name}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  ログアウト
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
