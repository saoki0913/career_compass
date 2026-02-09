import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ガクチカSTARテンプレ | 就活Pass",
  description:
    "ガクチカをSTAR（Situation/Task/Action/Result）で整理するテンプレ。面接で深掘りされても崩れない骨格を作ります。",
};

export default function GakuchikaStarTemplatePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            就活Pass
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
        <h1 className="text-3xl font-bold tracking-tight">ガクチカ STAR テンプレ</h1>
        <p className="mt-2 text-muted-foreground">
          面接の深掘りは、ほぼSTARで来ます。最初から骨格を作るのが最短です。
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">STARの書き方</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium text-foreground">S（状況）</span>:
                いつ/どこで/どんな制約があったか（長くしない）
              </li>
              <li>
                <span className="font-medium text-foreground">T（課題）</span>:
                目標と、なぜ難しいか（定量があると強い）
              </li>
              <li>
                <span className="font-medium text-foreground">A（行動）</span>:
                自分が考え、どう動いたか（工夫を2〜3個）
              </li>
              <li>
                <span className="font-medium text-foreground">R（結果）</span>:
                成果と学び。再現性（次に活かせる）で締める
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">そのまま使えるテンプレ</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed">
            <p className="font-medium">テンプレ</p>
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">S:</span>{" "}
                {`{状況: 例) ○○サークルで新歓の参加者が前年比-30%だった}`}
              </p>
              <p>
                <span className="font-semibold text-foreground">T:</span>{" "}
                {`{課題: 例) 参加者を+50人増やす。理由は△△で訴求が弱かった}`}
              </p>
              <p>
                <span className="font-semibold text-foreground">A:</span>{" "}
                {`{行動: 例) ①ターゲットを2群に分け訴求を変更 ②SNS投稿をABテスト ③当日の導線を改善}`}
              </p>
              <p>
                <span className="font-semibold text-foreground">R:</span>{" "}
                {`{結果: 例) 参加者が+65人。施策の優先順位付けと検証の型を学んだ}`}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">強くするコツ（面接向け）</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="list-disc pl-5 space-y-2">
              <li>数字を1つ入れる（参加者、時間、回数、率など）</li>
              <li>行動は「意思決定」と「検証」が見えるように書く</li>
              <li>結果は成果だけでなく、学びと再現性で締める</li>
            </ul>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border bg-muted/20 p-6">
          <p className="font-medium">ガクチカの深掘りはアプリで</p>
          <p className="mt-1 text-sm text-muted-foreground">
            会話形式で深掘りして、素材としてストックできます。
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
        </section>
      </main>
    </div>
  );
}

