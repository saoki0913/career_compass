import type { Metadata } from "next";
import Link from "next/link";
import { EsCounterClient } from "@/components/tools/EsCounterClient";

export const metadata: Metadata = {
  title: "ES文字数カウント | 就活Pass",
  description:
    "ESの文字数を300/400/500字で簡単にチェックできる無料ツール。空白・改行を除いたカウントにも対応。",
};

export default function EsCounterPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            就活Pass
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/tools" className="text-muted-foreground hover:text-foreground transition-colors">
              ツール一覧
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
        <h1 className="text-3xl font-bold tracking-tight">ES文字数カウント</h1>
        <p className="mt-2 text-muted-foreground">
          まずは文字数を合わせるだけで、読みやすさが上がります。
        </p>

        <div className="mt-8">
          <EsCounterClient />
        </div>

        <div className="mt-12 text-sm text-muted-foreground">
          関連:
          <Link href="/templates/shiboudouki" className="underline hover:text-foreground ml-2">
            志望動機テンプレ
          </Link>
          <Link href="/checklists/deadline-management" className="underline hover:text-foreground ml-2">
            締切管理チェックリスト
          </Link>
        </div>
      </main>
    </div>
  );
}

