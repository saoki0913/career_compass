import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "ESテンプレ・志望動機テンプレ集 | 就活Pass",
  description:
    "志望動機テンプレ、ガクチカSTARテンプレなど、就活ESで使える構成テンプレをまとめました。ES添削AIと合わせて使いやすい公開ページです。",
  path: "/templates",
  keywords: ["ES テンプレ", "志望動機 テンプレ", "ガクチカ 書き方", "ES添削 AI", "就活Pass テンプレ"],
});

export default function TemplatesPage() {
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
        <h1 className="text-3xl font-bold tracking-tight">テンプレ集</h1>
        <p className="mt-2 text-muted-foreground">
          構成が決まると、文章が一気に書きやすくなります。
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/templates/shiboudouki"
            className="rounded-2xl border bg-card p-6 hover:bg-muted/20 transition-colors"
          >
            <p className="text-sm text-muted-foreground">志望動機</p>
            <p className="mt-1 text-lg font-semibold">志望動機テンプレ</p>
            <p className="mt-2 text-sm text-muted-foreground">
              結論→根拠→企業接続→再現性の流れで迷わない。
            </p>
          </Link>

          <Link
            href="/templates/gakuchika-star"
            className="rounded-2xl border bg-card p-6 hover:bg-muted/20 transition-colors"
          >
            <p className="text-sm text-muted-foreground">ガクチカ</p>
            <p className="mt-1 text-lg font-semibold">STARテンプレ</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Situation/Task/Action/Resultで強い一貫性を作る。
            </p>
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border bg-muted/20 p-6">
          <p className="font-medium">文字数調整も一緒に</p>
          <p className="mt-1 text-sm text-muted-foreground">
            書いたら、まずは文字数を合わせてから推敲するとラクです。
          </p>
          <div className="mt-4">
            <Link
              href="/tools/es-counter"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30"
            >
              ES文字数カウントへ
            </Link>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border bg-card p-6">
          <p className="font-medium">関連ページ</p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            <Link href="/es-tensaku-ai" className="hover:text-foreground">
              ES添削AIを探している方へ
            </Link>
            <Link href="/shukatsu-ai" className="hover:text-foreground">
              就活AIの使い方ガイド
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
