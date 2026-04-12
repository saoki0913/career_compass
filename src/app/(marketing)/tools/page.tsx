import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookText,
  CheckCircle2,
  FileText,
  ListChecks,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { StickyCTABar } from "@/components/landing/StickyCTABar";
import {
  PublicSurfaceButton,
  PublicSurfaceFrame,
  PublicSurfaceHero,
  PublicSurfacePanel,
  publicSurfaceFeatureIconClassName,
} from "@/components/public-surface";
import { landingMedia } from "@/components/landing/landing-media";
import { createMarketingMetadata } from "@/lib/marketing-metadata";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createMarketingMetadata({
  title: "無料ツール | 就活Pass",
  description:
    "ES文字数カウントとテンプレをまとめた、就活Passの無料公開ページです。下準備を短くして、そのままアプリの管理体験へつなげます。",
  path: "/tools",
  keywords: ["ES 文字数 カウント", "就活 無料ツール", "就活Pass ツール", "志望動機 テンプレ"],
});

const toolsHeroPreview = landingMedia.heroDashboard;

const mainClass = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export default function ToolsPage() {
  return (
    <>
      <LandingHeader />
      <PublicSurfaceFrame>
        <main>
        <PublicSurfaceHero
          title="無料ツール"
          description="ESの文字数カウントと、志望動機のテンプレがあります。"
          actions={[
            { href: "/login", label: "アプリで続ける" },
            { href: "/templates", label: "テンプレ集を見る", variant: "secondary" },
          ]}
          points={["文字数カウント", "志望動機テンプレ", "ログインで本編へ"]}
          visual={
            <div className="p-5 sm:p-6">
              <div className="relative overflow-hidden rounded-[24px] border border-slate-200/80 bg-slate-50">
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur">
                  <div>
                    <p className="text-xs font-medium tracking-[0.18em] text-slate-500 uppercase">
                      Preview
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">就活Pass</p>
                  </div>
                </div>
                <div className="relative aspect-[16/10] bg-slate-100">
                  <Image
                    src={toolsHeroPreview.src}
                    alt={toolsHeroPreview.alt}
                    fill
                    unoptimized={toolsHeroPreview.src.endsWith(".svg")}
                    sizes="(min-width: 1024px) 520px, 100vw"
                    className="object-cover object-top"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <span className={publicSurfaceFeatureIconClassName}>
                    <FileText className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">ES文字数</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      300 / 400 / 500字の目安で確認。
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <span className={publicSurfaceFeatureIconClassName}>
                    <BookText className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">志望動機</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      書き始め用の構成テンプレ。
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <span className={publicSurfaceFeatureIconClassName}>
                    <ListChecks className="size-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">アプリ</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                      保存・添削・締切はログイン後。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <section className={cn(mainClass, "pb-12 pt-2 sm:pb-16 lg:pb-20")}>
          <PublicSurfacePanel title="ES文字数カウント" tone="accent" className="group">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                    300 / 400 / 500字を確認
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                    空白・改行を除いた文字数でも数えられます。
                  </p>
                </div>
                <span className="hidden rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--lp-navy)] shadow-sm sm:inline-flex">
                  無料
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {["空白除外", "改行除外"].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <PublicSurfaceButton href="/tools/es-counter">ES文字数カウントを使う</PublicSurfaceButton>
                <Link
                  href="/templates/shiboudouki"
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-[var(--lp-navy)]"
                >
                  志望動機の型を見る
                  <ArrowUpRight className="size-4 shrink-0" aria-hidden />
                </Link>
              </div>
            </div>
          </PublicSurfacePanel>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <PublicSurfacePanel title="志望動機テンプレ">
              <div className="space-y-4">
                <p className="text-sm leading-7 text-slate-600">
                  結論→根拠→企業接続→再現性の流れで書き始められます。
                </p>
                <div className="flex flex-wrap gap-2">
                  {["結論", "根拠", "企業接続", "再現性"].map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <PublicSurfaceButton href="/templates/shiboudouki" variant="secondary">
                  テンプレを開く
                </PublicSurfaceButton>
              </div>
            </PublicSurfacePanel>

            <PublicSurfacePanel title="アプリで続ける">
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--lp-navy)]" aria-hidden />
                    <p className="text-sm leading-7 text-slate-600">
                      企業登録、締切、ESの保存、AI添削をまとめて使えます。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <PublicSurfaceButton href="/login">アプリで続ける</PublicSurfaceButton>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-[var(--lp-navy)]"
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
    <LandingFooter />
    <StickyCTABar />
    </>
  );
}
