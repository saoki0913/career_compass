"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";
import Link from "next/link";

export function DashboardHeader() {
  const { user, isGuest } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">U</span>
              </div>
              <span className="font-bold text-lg tracking-tight">ウカルン</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/dashboard"
                className="px-3 py-2 text-sm font-medium rounded-lg hover:bg-secondary transition-colors"
              >
                ダッシュボード
              </Link>
              <Link
                href="/companies"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-colors"
              >
                企業管理
              </Link>
              <Link
                href="/es"
                className="px-3 py-2 text-sm font-medium text-muted-foreground rounded-lg hover:bg-secondary hover:text-foreground transition-colors"
              >
                ES作成
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
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
