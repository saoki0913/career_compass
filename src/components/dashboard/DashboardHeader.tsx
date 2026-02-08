"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import Link from "next/link";
import { useNotifications, NOTIFICATION_TYPE_ICONS } from "@/hooks/useNotifications";
import { useCredits } from "@/hooks/useCredits";
import { SearchBar } from "@/components/search";
import { BottomTabBar } from "./BottomTabBar";
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

const CreditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

export function DashboardHeader() {
  const { user, isGuest } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications({ limit: 5 });
  const { balance } = useCredits();
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotificationDropdown(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
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
    <>
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <img
                src="/icon.png"
                alt="Career Compass"
                className="w-8 h-8 rounded-lg shadow-sm group-hover:shadow-md transition-all duration-200"
              />
              <span className="font-bold text-lg tracking-tight">Career Compass</span>
            </Link>
            <nav className="hidden lg:flex items-center">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                ホーム
              </Link>
              <Link
                href="/companies"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                企業
              </Link>
              <Link
                href="/es"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                ES
              </Link>
              <Link
                href="/gakuchika"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                ガクチカ
              </Link>
              <Link
                href="/calendar"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-all duration-200 cursor-pointer whitespace-nowrap"
              >
                カレンダー
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {/* Search Bar */}
            <SearchBar />

            {/* Notification Bell */}
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
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

              {/* Notification Dropdown */}
              {showNotificationDropdown && (
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
                      onClick={() => setShowNotificationDropdown(false)}
                      className="block w-full py-3 text-center text-sm text-primary font-medium hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                    >
                      すべての通知を見る
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Credit Balance */}
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all duration-200"
            >
              <CreditIcon />
              <span className="text-sm font-semibold text-primary">
                {balance?.toLocaleString() ?? "---"}
              </span>
            </Link>

            {isGuest ? (
              <Button asChild size="sm">
                <Link href="/login">ログイン</Link>
              </Button>
            ) : (
              /* User Avatar Dropdown - UX: Interactive avatar with user info/settings/logout */
              <div className="relative" ref={userDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-secondary transition-all duration-200 cursor-pointer"
                >
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt=""
                      className="w-8 h-8 rounded-full ring-2 ring-background"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {user?.name?.charAt(0) || "U"}
                    </div>
                  )}
                  <ChevronDownIcon />
                </button>

                {/* User Dropdown */}
                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden z-50">
                    {/* User Info Header */}
                    <div className="px-4 py-3 border-b border-border/50 bg-muted/30">
                      <div className="flex items-center gap-3">
                        {user?.image ? (
                          <img
                            src={user.image}
                            alt=""
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-lg">
                            {user?.name?.charAt(0) || "U"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{user?.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-1">
                      <Link
                        href="/profile"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <UserIcon />
                        <span>プロフィール</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <SettingsIcon />
                        <span>設定</span>
                      </Link>
                      <Link
                        href="/pricing"
                        onClick={() => setShowUserDropdown(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors cursor-pointer sm:hidden"
                      >
                        <CreditIcon />
                        <span>プラン・クレジット</span>
                      </Link>
                    </div>

                    {/* Logout */}
                    <div className="border-t border-border/50">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                      >
                        <LogoutIcon />
                        <span>ログアウト</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    <BottomTabBar />
    </>
  );
}
