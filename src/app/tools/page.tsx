import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活の無料ツール集 | 就活Pass",
  description:
    "就活のES作成、ES文字数調整、締切管理に役立つ無料ツール集。就活AIを使う前の下準備にも使えます。",
  path: "/tools",
  keywords: ["ES 文字数 カウント", "就活 無料ツール", "就活AI 無料", "就活Pass ツール"],
});

export default function ToolsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            就活Pass
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/templates" className="text-muted-foreground hover:text-foreground transition-colors">
              テンプレ
            </Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              料金
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
              ログイン
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">無料ツール</h1>
        <p className="mt-2 text-muted-foreground">
          就活の「やるべきこと」を減らす、小さなツールをまとめました。
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/tools/es-counter"
            className="rounded-2xl border bg-card p-6 hover:bg-muted/20 transition-colors"
          >
            <p className="text-sm text-muted-foreground">ES作成</p>
            <p className="mt-1 text-lg font-semibold">ES文字数カウント</p>
            <p className="mt-2 text-sm text-muted-foreground">
              300/400/500字の文字数を一瞬で確認できます。
            </p>
          </Link>

          <Link
            href="/templates/shiboudouki"
            className="rounded-2xl border bg-card p-6 hover:bg-muted/20 transition-colors"
          >
            <p className="text-sm text-muted-foreground">テンプレ</p>
            <p className="mt-1 text-lg font-semibold">志望動機テンプレ</p>
            <p className="mt-2 text-sm text-muted-foreground">
              構成と書き出し例で、迷わず書き始められます。
            </p>
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border bg-muted/20 p-6">
          <p className="font-medium">アプリで続きもできます</p>
          <p className="mt-1 text-sm text-muted-foreground">
            企業登録、締切管理、ESの保存、AI添削まで一つにまとめたい方はアプリをご利用ください。
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              無料で始める
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30"
            >
              料金を見る
            </Link>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border bg-card p-6">
          <p className="font-medium">関連ガイド</p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            <Link href="/es-tensaku-ai" className="hover:text-foreground">
              ES添削AIの選び方を見る
            </Link>
            <Link href="/shukatsu-ai" className="hover:text-foreground">
              就活AIでできることを見る
            </Link>
            <Link href="/shukatsu-kanri" className="hover:text-foreground">
              就活の締切管理アプリの使い方を見る
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
