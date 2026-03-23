import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  ClipboardPaste,
  FileText,
  ListChecks,
  LogIn,
} from "lucide-react";
import { landingMedia } from "@/components/landing/landing-media";
import {
  PublicSurfaceFrame,
  PublicSurfaceHeader,
  PublicSurfaceHero,
  PublicSurfacePanel,
} from "@/components/public-surface";
import { EsCounterClient } from "@/components/tools/EsCounterClient";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createMarketingMetadata({
  title: "ES文字数カウント | 就活Pass",
  description:
    "ESの文字数を300/400/500字で簡単にチェックできる無料ツール。空白・改行を除いたカウントにも対応。",
  path: "/tools/es-counter",
  keywords: ["ES 文字数 カウント", "ES 文字数チェッカー", "就活 無料ツール"],
});

const esCounterPreview = landingMedia.esReview;

const mainClass = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export default function EsCounterPage() {
  return (
    <PublicSurfaceFrame>
      <PublicSurfaceHeader
        navLinks={[
          { href: "/tools", label: "ツール一覧" },
          { href: "/templates", label: "テンプレ集" },
          { href: "/pricing", label: "料金" },
        ]}
        primaryAction={{ href: "/login", label: "アプリで続ける" }}
        secondaryAction={{ href: "/tools", label: "ツール一覧" }}
      />

      <main>
        <PublicSurfaceHero
          title="ES文字数カウント"
          description="本文を貼り付けて、300・400・500字までの文字数を確認できます。空白や改行を除いた数え方にも対応しています。"
          actions={[
            { href: "/login", label: "アプリで続ける" },
            { href: "/templates/shiboudouki", label: "志望動機テンプレを見る", variant: "secondary" },
          ]}
          points={["300 / 400 / 500字", "空白・改行を除外可", "無料"]}
          visual={
            <div className="p-5 sm:p-6">
              <div className="relative overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
                <div className="absolute inset-x-0 top-0 z-10 flex items-center border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur">
                  <div>
                    <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                      Preview
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">文字数チェック</p>
                  </div>
                </div>
                <div className="relative aspect-[16/10] bg-slate-100">
                  <Image
                    src={esCounterPreview.src}
                    alt={esCounterPreview.alt}
                    fill
                    unoptimized={esCounterPreview.src.endsWith(".svg")}
                    sizes="(min-width: 1024px) 520px, 100vw"
                    className="object-cover object-top"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700">
                    <FileText className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">文字数</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">除外ルールを選べます。</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700">
                    <ClipboardList className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">目安</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">300 / 400 / 500字のバー表示。</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700">
                    <CheckCircle2 className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">そのまま利用</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">会員登録なしで試せます。</p>
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <section className={cn(mainClass, "pb-12 pt-2 sm:pb-16 lg:pb-20")}>
          <PublicSurfacePanel title="ES文字数カウント" tone="accent">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { label: "1", text: "ES本文を貼り付ける", Icon: ClipboardPaste },
                    { label: "2", text: "300 / 400 / 500字に合わせる", Icon: ListChecks },
                    { label: "3", text: "必要ならアプリへ", Icon: LogIn },
                  ] as const
                ).map(({ label, text, Icon }) => (
                  <div
                    key={label}
                    className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-500">STEP {label}</p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-700">{text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4">
                <EsCounterClient />
              </div>

              <div className="flex flex-wrap gap-4 border-t border-slate-200/80 pt-5">
                <Link
                  href="/templates/shiboudouki"
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  志望動機テンプレ
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
                <Link
                  href="/checklists/deadline-management"
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  締切管理チェックリスト
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </Link>
              </div>
            </div>
          </PublicSurfacePanel>
        </section>
      </main>
    </PublicSurfaceFrame>
  );
}
