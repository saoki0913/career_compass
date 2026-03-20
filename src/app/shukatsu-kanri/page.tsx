import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活の締切管理アプリを探している方へ | 就活Pass",
  description:
    "就活の締切管理アプリを探している学生向けに、ES提出、Webテスト、面接、説明会の管理を就活Passでまとめる方法を紹介します。",
  path: "/shukatsu-kanri",
  keywords: ["就活 締切 管理", "就活 締切管理 アプリ", "就活 管理 アプリ", "就活 スケジュール 管理", "就活Pass"],
});

export default function ShukatsuKanriPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">就活の締切管理 / 就活管理アプリ</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            就活の締切管理を、ES作成や企業管理と一緒に進める
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            就活の締切管理だけを別ツールで行うと、ESや志望動機との往復が増えます。就活Pass は、
            締切管理、ES添削、企業情報整理を一つのアプリで扱いたい人向けの就活管理アプリです。
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">登録すべき締切</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              ES提出、Webテスト、説明会、面接、内定承諾など、就活で抜けやすい期限をまとめて管理できます。
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">企業ごとの進捗把握</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              応募企業ごとの状況と締切を同じ場所で管理しやすく、優先順位の判断もしやすくなります。
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">ES作成とつなげやすい</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              締切が見える状態で ES添削AI やテンプレと連携し、提出前のタスクを組みやすくします。
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-muted/20 p-6">
          <h2 className="text-xl font-semibold">関連コンテンツ</h2>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground">
            <Link href="/checklists/deadline-management" className="hover:text-foreground">
              締切管理チェックリストを見る
            </Link>
            <Link href="/es-tensaku-ai" className="hover:text-foreground">
              ES添削AIの紹介を見る
            </Link>
            <Link href="/pricing" className="hover:text-foreground">
              料金プランを見る
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
