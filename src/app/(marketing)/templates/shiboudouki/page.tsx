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
  title: "志望動機テンプレ | 就活Pass",
  description:
    "志望動機を結論から書くための無料テンプレです。構成、書き出し、注意点を整理して、アプリへつなげます。",
  path: "/templates/shiboudouki",
  keywords: ["志望動機 テンプレ", "志望動機 書き方", "ES 志望動機 例文"],
});

const mainClass = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export default function ShiboudoukiTemplatePage() {
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
          title="志望動機テンプレ"
          description="結論→根拠→企業接続→再現性→入社後の流れで書くための例です。"
          actions={[
            { href: "/login", label: "アプリで続ける" },
            { href: "/tools/es-counter", label: "文字数カウントへ", variant: "secondary" },
          ]}
          points={["結論から", "5つのブロック", "無料"]}
          visual={
            <div className="p-5 sm:p-6">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                    Preview
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">構成の例</p>
                </div>
                <div className="space-y-3 p-4">
                  {[
                    { label: "1", title: "結論", text: "志望理由を一文で言い切る。" },
                    { label: "2", title: "根拠", text: "その志向になった経験を置く。" },
                    { label: "3", title: "企業接続", text: "事業・強み・取り組みにつなぐ。" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold tracking-[0.18em] text-sky-700">{item.label}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          }
        />

        <section className={cn(mainClass, "space-y-10 pb-12 pt-2 sm:pb-16 lg:pb-20")}>
          <div className="grid gap-6 lg:grid-cols-2">
            <PublicSurfacePanel title="書き出し例" tone="accent">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                  <p className="text-sm font-medium text-slate-500">例</p>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    私が貴社を志望する理由は、{`{結論}`}を実現したいからです。 その背景には、{`{根拠}`}と
                    {`{企業接続}`}があります。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["結論", "根拠", "企業接続"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="構成（5段）">
              <div className="space-y-3">
                {[
                  { label: "1. 結論", text: "志望理由を一文で言い切る。" },
                  { label: "2. 原体験", text: "その志向になった経験を置く。" },
                  { label: "3. 企業接続", text: "事業 / 強み / 取り組みとつなぐ。" },
                  { label: "4. 再現性", text: "入社後に活かせる強みを示す。" },
                  { label: "5. 入社後", text: "何をどう学びたいかまで書く。" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </PublicSurfacePanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PublicSurfacePanel title="NGになりやすい形" tone="soft">
              <ul className="space-y-3 text-sm leading-7 text-slate-600">
                <li>企業接続が「理念に共感」で止まる</li>
                <li>原体験が長く、結論が見えない</li>
                <li>入社後が「成長したい」で止まる</li>
              </ul>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="整えるコツ" tone="accent">
              <div className="space-y-3">
                {[
                  "数字を 1 つ入れる",
                  "行動には意思決定と検証を含める",
                  "結果は成果と学びで締める",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4"
                  >
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
                    <p className="text-sm leading-7 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </PublicSurfacePanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PublicSurfacePanel title="文字数を合わせる" tone="soft">
              <div className="flex flex-wrap gap-3">
                <PublicSurfaceButton href="/tools/es-counter">ES文字数カウントへ</PublicSurfaceButton>
                <Link
                  href="/templates/gakuchika-star"
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  ガクチカテンプレを見る
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
              </div>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="アプリで続ける" tone="accent">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
                  <p className="text-sm leading-7 text-slate-600">
                    ESの保存・AI添削・締切管理はログイン後に利用できます。
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
