"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";

export default function Home() {
  const { isAuthenticated, isGuest, isLoading } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-black">
      <main className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center gap-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
            ウカルン
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」
          </p>
          <div className="flex gap-4">
            {isLoading ? (
              <Button size="lg" disabled>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                読み込み中...
              </Button>
            ) : isAuthenticated ? (
              <Button size="lg" asChild>
                <Link href="/dashboard">ダッシュボードへ</Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link href="/login">ログイン</Link>
                </Button>
                {!isGuest && (
                  <Button variant="outline" size="lg" asChild>
                    <Link href="/dashboard">ゲストで始める</Link>
                  </Button>
                )}
                {isGuest && (
                  <Button variant="outline" size="lg" asChild>
                    <Link href="/dashboard">続ける</Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>締切管理</CardTitle>
              <CardDescription>
                ES・面接の締切を一元管理
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                企業情報から自動で締切を抽出。Googleカレンダー連携で通知も万全。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI添削</CardTitle>
              <CardDescription>
                ESの品質をAIがチェック
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                文章構成・誤字脱字・具体性をAIが分析し、改善点を提案。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ガクチカ深掘り</CardTitle>
              <CardDescription>
                自己分析をAIがサポート
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                AIとの対話形式で、あなたの強みを引き出し言語化します。
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Free プランなら月額 ¥0 で始められます
          </p>
        </div>
      </main>
    </div>
  );
}
