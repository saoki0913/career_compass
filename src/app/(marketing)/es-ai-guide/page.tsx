import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "ES AI の選び方 | 単発ツールと一体型の就活アプリ",
  description:
    "ES AI・ES添削AIを選ぶときの観点（単発で済ませるか、締切管理まで含めるか）と、就活Passの位置づけを整理しました。",
  path: "/es-ai-guide",
  keywords: ["ES AI", "ES添削 AI", "エントリーシート AI", "就活 アプリ 比較", "就活Pass"],
});

export default function EsAiGuidePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">ES AI / ES添削AI</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            ES AIを選ぶときの考え方
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            ES添削AIは、文章を一気に書き換えるものから、設問ごとに観点を整理するものまで幅があります。
            さらに「添削だけで終わらせず、提出期限や他の設問と一緒に管理したい」かどうかで、向いているサービスが変わります。
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">単発型が向く場合</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
              <li>その場で文字数や表現だけ整えればよい</li>
              <li>締切や企業管理は別ツールで十分</li>
              <li>ログインなしの軽い利用を優先したい</li>
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">一体型（就活Pass）が向く場合</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
              <li>ES添削と志望動機・ガクチカを同じ流れで進めたい</li>
              <li>企業ごとの締切やタスクをアプリ内でまとめたい</li>
              <li>就活AIとして継続利用し、クレジットで使い分けたい</li>
            </ul>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-muted/20 p-6">
          <h2 className="text-xl font-semibold">関連ページ</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
            <li>
              <Link href="/es-tensaku-ai" className="text-primary hover:underline">
                ES添削AIガイド
              </Link>
            </li>
            <li>
              <Link href="/entry-sheet-ai" className="text-primary hover:underline">
                エントリーシート添削とESの整理
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="text-primary hover:underline">
                料金・クレジット
              </Link>
            </li>
          </ul>
        </section>

        <section className="mt-12">
          <Link
            href="/tools"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30"
          >
            無料ツールを見る
          </Link>
        </section>
      </div>
    </main>
  );
}
