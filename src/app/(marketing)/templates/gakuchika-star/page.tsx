import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import {
  PublicSurfaceButton,
  PublicSurfaceFrame,
  PublicSurfaceHeader,
  PublicSurfaceHero,
  PublicSurfacePanel,
} from "@/components/public-surface";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createMarketingMetadata({
  title: "ガクチカSTARテンプレ | 就活Pass",
  description:
    "ガクチカをSTARで整理する無料テンプレです。面接で深掘りされても崩れない骨格を作り、アプリへつなげます。",
  path: "/templates/gakuchika-star",
  keywords: ["ガクチカ STAR", "ガクチカ テンプレ", "学生時代に力を入れたこと 書き方"],
});

const mainClass = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export default function GakuchikaStarTemplatePage() {
  return (
    <PublicSurfaceFrame>
      <PublicSurfaceHeader
        navLinks={[
          { href: "/templates", label: "テンプレ一覧" },
          { href: "/tools/es-counter", label: "文字数カウント" },
          { href: "/pricing", label: "料金" },
        ]}
        primaryAction={{ href: "/login", label: "アプリで続ける" }}
        secondaryAction={{ href: "/templates", label: "テンプレ一覧" }}
      />

      <main>
        <PublicSurfaceHero
          title="ガクチカ STAR テンプレ"
          description="経験を Situation / Task / Action / Result に分けて書くための例です。"
          actions={[
            { href: "/login", label: "アプリで続ける" },
            { href: "/tools/es-counter", label: "文字数カウントへ", variant: "secondary" },
          ]}
          points={["S / T / A / R", "書き出し例つき", "無料"]}
          visual={
            <div className="p-5 sm:p-6">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                    Preview
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">STAR の項目</p>
                </div>
                <div className="space-y-3 p-4">
                  {[
                    { label: "S", title: "Situation", text: "いつ / どこで / どんな状況か" },
                    { label: "T", title: "Task", text: "課題と、なぜ難しいか" },
                    { label: "A", title: "Action", text: "自分の工夫と意思決定" },
                    { label: "R", title: "Result", text: "成果と学び、再現性" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold tracking-[0.18em] text-primary">{item.label}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
        />

        <section className={cn(mainClass, "space-y-10 pb-12 pt-2 sm:pb-16 lg:pb-20")}>
          <div className="grid gap-6 lg:grid-cols-2">
            <PublicSurfacePanel title="STAR の型" tone="accent">
              <div className="space-y-3">
                {[
                  { label: "S", text: "状況を短く置く。いつ / どこで / 何が起きたか。" },
                  { label: "T", text: "課題を具体にする。何が難しかったかを一文で。" },
                  { label: "A", text: "行動を分けて書く。工夫は 2〜3 個に絞る。" },
                  { label: "R", text: "結果と学びで締める。再現性まで見せる。" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                    <p className="text-xs font-semibold tracking-[0.18em] text-primary">{item.label}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-700">{item.text}</p>
                  </div>
                ))}
              </div>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="書き出し例">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-500">例</p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {`{状況}`}の中で、{`{課題}`}を解決するために、{`{自分の行動}`}を行いました。
                    その結果、{`{結果}`}という学びを得ました。
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    "数字を 1 つ入れる",
                    "工夫を 2〜3 個に絞る",
                    "結果は学びまで含める",
                    "話し言葉になりすぎない",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                      <Sparkles className="size-4 text-primary" aria-hidden />
                      <p className="mt-3 text-sm leading-7 text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </PublicSurfacePanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PublicSurfacePanel title="よくあるつまずき" tone="soft">
              <ul className="space-y-3 text-sm leading-7 text-slate-600">
                <li>出来事の説明が長く、何をしたかが見えない</li>
                <li>結果が成果だけで終わり、学びが抜ける</li>
                <li>再現性がなく、その人らしさが伝わらない</li>
              </ul>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="整えるコツ" tone="accent">
              <div className="space-y-3">
                {[
                  "S は短く、背景を足しすぎない",
                  "T は定量があると伝わりやすい",
                  "A は意思決定を中心に書く",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <p className="text-sm leading-7 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </PublicSurfacePanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PublicSurfacePanel title="ほかのテンプレ" tone="soft">
              <div className="flex flex-wrap gap-3">
                <PublicSurfaceButton href="/templates/shiboudouki">志望動機テンプレへ</PublicSurfaceButton>
                <Link
                  href="/tools/es-counter"
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  文字数カウントへ
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
              </div>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="アプリで続ける" tone="accent">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <p className="text-sm leading-7 text-slate-600">
                    ガクチカの保存・添削・締切管理はログイン後に利用できます。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <PublicSurfaceButton href="/login">アプリで続ける</PublicSurfaceButton>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                  >
                    料金を見る
                    <ArrowRight className="size-4 shrink-0" aria-hidden />
                  </Link>
                </div>
              </div>
            </PublicSurfacePanel>
          </div>
        </section>
      </main>
    </PublicSurfaceFrame>
  );
}
