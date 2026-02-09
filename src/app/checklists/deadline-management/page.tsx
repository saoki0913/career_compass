import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "締切管理チェックリスト | ウカルン",
  description:
    "就活の締切（ES/Webテスト/面接/説明会など）を落とさないためのチェックリスト。週次運用の型も掲載。",
};

export default function DeadlineChecklistPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            ウカルン
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/checklists" className="text-muted-foreground hover:text-foreground transition-colors">
              チェックリスト一覧
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
        <h1 className="text-3xl font-bold tracking-tight">締切管理チェックリスト</h1>
        <p className="mt-2 text-muted-foreground">
          まずは「締切の種類」を揃えて登録し、週次で見直すだけで事故が激減します。
        </p>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">1. まず登録する締切（抜けがち）</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="list-disc pl-5 space-y-2">
              <li>ES提出締切（本締切と、任意の中間締切）</li>
              <li>Webテスト受験期限（開始日がある場合は開始日も）</li>
              <li>面接日程（候補日ではなく確定日）</li>
              <li>説明会/面談（任意でも、選考に影響するものは登録）</li>
              <li>内定承諾/辞退の期限（“いつまでに返答”）</li>
            </ul>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">2. 週次の見直し（10分でOK）</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <ol className="list-decimal pl-5 space-y-2">
              <li>今週の締切を全部見る（7日以内）</li>
              <li>未確定の締切を確定する（低/中のものを優先）</li>
              <li>ES/テストの作業時間をブロックする（先にカレンダーへ）</li>
              <li>タスクを細分化して、今日やる1つを決める</li>
            </ol>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">3. よくある事故パターン</h2>
          <div className="rounded-2xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground">
            <ul className="list-disc pl-5 space-y-2">
              <li>Webテストが“受験期限”でなく“申込締切”だけ登録されている</li>
              <li>ESを「当日」にやろうとして詰む（中間締切がない）</li>
              <li>複数企業が重なって、優先順位が決まっていない</li>
            </ul>
          </div>
        </section>

        <section className="mt-10 rounded-2xl border bg-muted/20 p-6">
          <p className="font-medium">締切とタスクをまとめて管理する</p>
          <p className="mt-1 text-sm text-muted-foreground">
            アプリなら、企業ごとに締切を登録してカレンダーにも反映できます。
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

