import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活チェックリスト集 | 就活Pass",
  description:
    "就活の締切管理やES作成を迷わず進めるためのチェックリスト集。就活AIやES添削AIと併用しやすい管理用コンテンツです。",
  path: "/checklists",
  keywords: ["就活 チェックリスト", "ES 提出 締切 管理", "就活 管理 アプリ", "就活Pass チェックリスト"],
});

export default function ChecklistsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            就活Pass
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/tools" className="text-muted-foreground hover:text-foreground transition-colors">
              ツール
            </Link>
            <Link href="/templates" className="text-muted-foreground hover:text-foreground transition-colors">
              テンプレ
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
              ログイン
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">チェックリスト</h1>
        <p className="mt-2 text-muted-foreground">
          「漏れ」を減らすだけで、就活はかなりラクになります。
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/checklists/deadline-management"
            className="rounded-2xl border bg-card p-6 hover:bg-muted/20 transition-colors"
          >
            <p className="text-sm text-muted-foreground">締切</p>
            <p className="mt-1 text-lg font-semibold">締切管理チェックリスト</p>
            <p className="mt-2 text-sm text-muted-foreground">
              抜けやすい締切の種類と、週次の見直しルール。
            </p>
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border bg-card p-6">
          <p className="font-medium">関連ページ</p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            <Link href="/shukatsu-kanri" className="hover:text-foreground">
              就活の締切管理アプリを探している方へ
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              料金プランを見る
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
