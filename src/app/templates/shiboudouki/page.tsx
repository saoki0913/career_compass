import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "志望動機テンプレ | ウカルン",
  description:
    "就活の志望動機を迷わず書くためのテンプレ。構成、書き出し例、よくあるNG例をまとめました。",
};

export default function ShiboudoukiTemplatePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            ウカルン
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/templates" className="text-muted-foreground hover:text-foreground transition-colors">
              テンプレ一覧
            </Link>
            <Link href="/tools/es-counter" className="text-muted-foreground hover:text-foreground transition-colors">
              文字数カウント
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
              ログイン
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">志望動機テンプレ</h1>
        <p className="mt-2 text-muted-foreground">
          「なぜこの会社？」に答える文章は、構成を固定すると一気に書けます。
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">結論から書く（1〜2文）</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed">
            <p className="font-medium">書き出し例</p>
            <p className="mt-2 text-muted-foreground">
              私が貴社を志望する理由は、{`{結論: 例) ○○領域で△△を実現したい}` }ためです。
              その背景として、{`{根拠}` }と{`{企業接続}` }があります。
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">構成テンプレ（おすすめ）</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-medium">1. 結論</p>
              <p className="text-sm text-muted-foreground mt-1">
                志望理由を一文で言い切る。
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-medium">2. 原体験（根拠）</p>
              <p className="text-sm text-muted-foreground mt-1">
                その志向になった経験を1つ。
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-medium">3. 企業接続（なぜこの会社）</p>
              <p className="text-sm text-muted-foreground mt-1">
                事業/強み/取り組みを具体に言う。
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-medium">4. 再現性（自分が活かせる強み）</p>
              <p className="text-sm text-muted-foreground mt-1">
                過去の行動が入社後に繋がると示す。
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-5 lg:col-span-2">
              <p className="font-medium">5. 入社後（やりたいこと）</p>
              <p className="text-sm text-muted-foreground mt-1">
                取り組みたいテーマと学び方を添える（抽象で終わらない）。
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">よくあるNG</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed">
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li>企業接続が「御社の理念に共感」だけで終わる</li>
              <li>原体験が長く、結論が見えない</li>
              <li>入社後が「成長したい」で止まる（何を、どう）</li>
            </ul>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border bg-muted/20 p-6">
          <p className="font-medium">書いたら文字数を合わせる</p>
          <p className="mt-1 text-sm text-muted-foreground">
            まずは指定文字数に合わせてから推敲すると、ムダが減ります。
          </p>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Link
              href="/tools/es-counter"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/30"
            >
              ES文字数カウント
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              アプリで管理する
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

