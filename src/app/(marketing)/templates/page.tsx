import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookText,
  CheckCircle2,
  FileText,
  ListChecks,
} from "lucide-react";
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
  title: "テンプレ集 | 就活Pass",
  description:
    "志望動機テンプレとガクチカ（STAR）テンプレの一覧です。就活Passで無料で閲覧できます。",
  path: "/templates",
  keywords: ["就活 テンプレ", "志望動機 テンプレ", "ガクチカ STAR", "就活Pass テンプレ"],
});

const mainClass = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export default function TemplatesPage() {
  return (
    <PublicSurfaceFrame>
      <PublicSurfaceHeader
        navLinks={[
          { href: "/tools", label: "ツール" },
          { href: "/pricing", label: "料金" },
          { href: "/login", label: "ログイン" },
        ]}
        primaryAction={{ href: "/login", label: "アプリで続ける" }}
        secondaryAction={{ href: "/tools/es-counter", label: "文字数カウント" }}
      />

      <main>
        <PublicSurfaceHero
          title="テンプレ集"
          description="志望動機とガクチカ（STAR）の書き出し用テンプレです。"
          actions={[
            { href: "/login", label: "アプリで続ける" },
            { href: "/tools/es-counter", label: "文字数カウントへ", variant: "secondary" },
          ]}
          points={["志望動機", "ガクチカ STAR", "無料で見られる"]}
          visual={
            <div className="p-5 sm:p-6">
              <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                    Preview
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">テンプレの種類</p>
                </div>

                <div className="space-y-3 p-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
                    <div className="flex items-center gap-2">
                      <BookText className="size-4 shrink-0 text-primary" aria-hidden />
                      <p className="text-sm font-semibold text-slate-900">志望動機</p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      結論→根拠→企業接続→再現性の順の例です。
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <ListChecks className="size-4 shrink-0 text-primary" aria-hidden />
                      <p className="text-sm font-semibold text-slate-900">ガクチカ STAR</p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      Situation / Task / Action / Result に分けて整理する例です。
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-primary" aria-hidden />
                      <p className="text-sm font-semibold text-slate-900">文字数</p>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      ES文字数カウントで 300 / 400 / 500字を確認できます。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <section className={cn(mainClass, "pb-12 pt-2 sm:pb-16 lg:pb-20")}>
          <div className="grid gap-6 lg:grid-cols-2">
            <PublicSurfacePanel title="志望動機テンプレ" tone="accent">
              <div className="space-y-4">
                <p className="text-sm leading-7 text-slate-600">
                  「なぜこの会社か」を、結論から書く流れの例です。
                </p>
                <div className="flex flex-wrap gap-2">
                  {["結論", "根拠", "企業接続", "再現性"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <PublicSurfaceButton href="/templates/shiboudouki">テンプレを見る</PublicSurfaceButton>
                  <Link
                    href="/tools/es-counter"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                  >
                    文字数カウントへ
                    <ArrowUpRight className="size-4 shrink-0" aria-hidden />
                  </Link>
                </div>
              </div>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="ガクチカ STAR テンプレ">
              <div className="space-y-4">
                <p className="text-sm leading-7 text-slate-600">
                  経験を S / T / A / R に分けて書くための例です。
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "S", text: "状況を短く置く" },
                    { label: "T", text: "課題を具体にする" },
                    { label: "A", text: "行動の工夫を書く" },
                    { label: "R", text: "結果と学びで締める" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold tracking-[0.18em] text-primary">{item.label}</p>
                      <p className="mt-3 text-sm leading-7 text-slate-700">{item.text}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <PublicSurfaceButton href="/templates/gakuchika-star" variant="secondary">
                    テンプレを見る
                  </PublicSurfaceButton>
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                  >
                    アプリで続ける
                    <ArrowRight className="size-4 shrink-0" aria-hidden />
                  </Link>
                </div>
              </div>
            </PublicSurfacePanel>
          </div>

          <div className="mt-6">
            <PublicSurfacePanel title="アプリで続ける">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <p className="text-sm leading-7 text-slate-600">
                      企業登録、締切、ESの保存、AI添削はログイン後に利用できます。
                    </p>
                  </div>
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
