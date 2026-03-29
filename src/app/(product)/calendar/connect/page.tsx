"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSafeRelativeReturnPath } from "@/lib/security/safe-return-path";

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export default function CalendarConnectPage() {
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();

  const returnTo = useMemo(
    () => getSafeRelativeReturnPath(searchParams.get("returnTo"), "/calendar/settings"),
    [searchParams]
  );
  const oauthHref = `/api/calendar/connect?returnTo=${encodeURIComponent(returnTo)}`;
  const loginHref = `/login?redirect=${encodeURIComponent(`/calendar/connect?returnTo=${encodeURIComponent(returnTo)}`)}`;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={returnTo}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>←</span>
          設定に戻る
        </Link>

        <Card className="border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-white">
              <GoogleIcon />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Googleカレンダーを連携</CardTitle>
              <CardDescription className="text-sm leading-6">
                ログイン済みでも、Google カレンダーへの予定追加と空き時間取得には追加の Google 認証が必要です。
                この画面から連携した場合にだけ、Google 側の権限付与へ進みます。
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-2xl border bg-muted/30 p-4">
              <p className="text-sm font-medium">この連携で使う権限</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>カレンダー一覧の取得</li>
                <li>就活Pass から作成した予定の追加</li>
                <li>空き時間計算のための busy 情報取得</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-900">
              Google でログインしたことと、Google カレンダー連携は別です。連携後は設定画面で追加先カレンダーを選べます。
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              {isAuthenticated ? (
                <Button asChild size="lg" className="sm:min-w-56">
                  <Link href={oauthHref}>
                    <GoogleIcon />
                    Google で連携する
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg" className="sm:min-w-56" disabled={isLoading}>
                  <Link href={loginHref}>
                    <GoogleIcon />
                    ログインして連携する
                  </Link>
                </Button>
              )}

              <Button asChild size="lg" variant="outline">
                <Link href={returnTo}>あとで設定する</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
