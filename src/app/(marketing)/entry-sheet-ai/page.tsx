import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "エントリーシート添削・ES添削 AI | 就活Pass",
  description:
    "エントリーシート（ES）添削とES添削AIの違い、就活Passでの使い方、無料で試せる範囲を就活生向けに整理しました。",
  path: "/entry-sheet-ai",
  keywords: [
    "エントリーシート 添削",
    "エントリーシート 添削 AI",
    "ES 添削",
    "ES添削 AI",
    "就活Pass",
  ],
});

export default function EntrySheetAiPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">エントリーシート / ES</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            エントリーシート添削とES添削AIを探している方へ
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            就活では「エントリーシート」「ES」「エントリー」と呼ばれる提出物を、企業ごとの設問に合わせて書きます。
            就活Pass のES添削AIは、設問タイプに合わせた改善ポイントの整理や下書き段階からのブラッシュアップに使えます。志望動機・ガクチカ・締切管理とも同じアプリ内でつながります。
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">言葉の整理</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              エントリーシートとESは、文脈によって同じ書類を指すことが多いです。検索では「ES添削」「エントリーシート
              添削」「ES AI」など表記が分かれますが、就活Pass ではどちらの検索意図でも同じESエディタと添削フローで対応できます。
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">単発ツールとの違い</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              文字数カウントだけのツールとは異なり、添削結果を企業・締切・他の設問と一緒に管理しやすい構成です。ES添削だけで終わらず、就活AIとして志望動機やガクチカにも広げられます。
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-muted/20 p-6">
          <h2 className="text-xl font-semibold">次のステップ</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            ES添削AIの機能詳細とFAQは専用ガイドにまとめています。
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
            <li>
              <Link href="/es-tensaku-ai" className="text-primary hover:underline">
                ES添削AI・ES AI ガイド
              </Link>
            </li>
            <li>
              <Link href="/es-ai-guide" className="text-primary hover:underline">
                ES AI の選び方（単発ツールと一体型）
              </Link>
            </li>
          </ul>
        </section>

        <section className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            料金プランを見る
          </Link>
          <Link
            href="/tools/es-counter"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30"
          >
            ES文字数カウント
          </Link>
        </section>
      </div>
    </main>
  );
}
