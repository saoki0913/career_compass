import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "就活AI・就活 AI アプリを探している方へ | 就活Pass",
  description:
    "就活AIや就活 AI アプリを探している学生向けに、就活Passでできること、ES添削AIとの違い、無料導線をまとめました。",
  path: "/shukatsu-ai",
  keywords: ["就活AI", "就活 AI アプリ", "AI 就活", "就活 アプリ", "就活Pass"],
});

export default function ShukatsuAiPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">就活AI / 就活 AI アプリ</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            就活AIでできることを、ES添削だけで終わらせない
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            就活AIを探している場合、必要なのは文章生成だけではありません。就活Pass は、
            ES添削、志望動機整理、ガクチカ深掘り、企業管理、締切管理までまとめて扱える就活AIアプリです。
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">就活AIとしての使いどころ</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
              <li>ESや志望動機の下書きを整える</li>
              <li>ガクチカを会話形式で深掘りする</li>
              <li>企業ごとの選考状況と締切を管理する</li>
            </ul>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">こんな人に向いています</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
              <li>就活塾ほど高額な支援は避けたい</li>
              <li>無料ツールだけでは不安が残る</li>
              <li>何から始めるか迷わず進めたい</li>
            </ul>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-muted/20 p-6">
          <h2 className="text-xl font-semibold">就活Pass の導線</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            無料ツールやテンプレから入り、必要に応じて就活AI機能や管理機能へ広げられる構成です。
            まずは ES文字数カウントやテンプレ集から試し、その後にアプリで継続管理できます。
          </p>
        </section>

        <section className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link href="/pricing" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            料金プランを見る
          </Link>
          <Link href="/tools" className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30">
            無料ツールを見る
          </Link>
          <Link href="/templates" className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30">
            テンプレ集を見る
          </Link>
        </section>
      </div>
    </main>
  );
}
