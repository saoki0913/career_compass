import type { Metadata } from "next";
import Link from "next/link";
import { createMarketingMetadata } from "@/lib/marketing-metadata";

export const metadata: Metadata = createMarketingMetadata({
  title: "ES添削AI・ES AI を探している方へ | 就活Pass",
  description:
    "ES添削AIや ES AI を探している就活生向けに、就活Passでできること、向いている使い方、無料で試せる範囲をまとめました。",
  path: "/es-tensaku-ai",
  keywords: ["ES添削 AI", "ES AI", "ES 添削 AI 無料", "エントリーシート 添削 AI", "就活Pass"],
});

const faqs = [
  {
    question: "ES添削AIで何ができますか？",
    answer:
      "就活Passでは、設問タイプに合わせたAI添削、改善ポイントの整理、志望動機やガクチカとの接続、文字数調整前の下書き整理まで行えます。",
  },
  {
    question: "無料でも試せますか？",
    answer:
      "Freeプランで始められます。まずは無料で文章の方向性や使い勝手を確認し、必要に応じて継続利用向けプランへ切り替えられます。",
  },
  {
    question: "ES添削だけのツールと何が違いますか？",
    answer:
      "ES添削だけで終わらず、志望動機・ガクチカ・企業管理・締切管理まで同じアプリ内で繋がる点が違いです。",
  },
] as const;

export default function EsTensakuAiPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">ES添削AI / ES AI</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            ES添削AIを探している就活生向けの就活Passガイド
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            ES添削AIでやりたいことは、文章を直すことだけではありません。就活Pass は、
            ES添削、志望動機整理、ガクチカの深掘り、締切管理まで一つの流れで扱える就活AIアプリです。
          </p>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">設問タイプに合わせた添削</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              ES添削AIとして、汎用的な文章修正だけでなく、設問タイプに応じた見直しポイントを整理できます。
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">下書き段階から使いやすい</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              完成前の文章でも方向修正しやすく、志望動機やガクチカの整理と一緒に進められます。
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">締切管理までつながる</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              ES提出前後のタスクや締切管理も含めて扱えるため、書いた後の管理までまとめられます。
            </p>
          </div>
        </section>

        <section className="mt-12 rounded-2xl border bg-muted/20 p-6">
          <h2 className="text-xl font-semibold">こんな検索意図に向いています</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
            <li>ES AI を使って、まず何を書き直せばいいか知りたい</li>
            <li>ES添削AIだけでなく、志望動機やガクチカにもつなげたい</li>
            <li>無料で試してから、継続利用を判断したい</li>
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">よくある質問</h2>
          <div className="mt-6 space-y-4">
            {faqs.map((faq) => (
              <div key={faq.question} className="rounded-2xl border bg-card p-5">
                <h3 className="font-medium text-foreground">{faq.question}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link href="/pricing" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            料金プランを見る
          </Link>
          <Link href="/tools/es-counter" className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30">
            ES文字数カウントを使う
          </Link>
          <Link href="/templates/shiboudouki" className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30">
            志望動機テンプレを見る
          </Link>
        </section>
      </div>
    </main>
  );
}
