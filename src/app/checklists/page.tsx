import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "チェックリスト | ウカルン",
  description:
    "就活の締切管理やES作成を迷わず進めるためのチェックリスト集。",
};

export default function ChecklistsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            ウカルン
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
      </main>
    </div>
  );
}

