"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

const HERO_CHECKS = [
  "カード登録不要",
  "8種の設問テンプレ対応",
  "成功時のみクレジット消費",
] as const;

export function EsTensakuAiHeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pb-16 pt-24 md:pb-24 md:pt-32 lg:pb-28 lg:pt-36">
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, var(--lp-hero-gradient-top), var(--lp-hero-gradient-mid), var(--lp-tint-navy-soft))",
        }}
      />

      <div className="mx-auto max-w-[1300px]">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">
          <div className="shrink-0 lg:w-[48%]">
            <LandingSectionMotion instant>
              <div className="mb-7">
                <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lp-navy)]" />
                  Feature · ES添削AI
                </span>
              </div>

              <h1
                className="text-[2.5rem] tracking-tight text-[var(--lp-navy)] md:text-[3.25rem] lg:text-[3.5rem]"
                style={{ fontWeight: 800, lineHeight: 1.15 }}
              >
                ES添削AIが、
                <br />
                設問ごとに改善案を提示。
              </h1>

              <p
                className="mt-6 mb-10 max-w-lg text-base text-slate-500 md:text-lg"
                style={{ lineHeight: 1.8 }}
              >
                ESの下書きを貼り付けるだけで、設問タイプに合わせた改善ポイントと書き換え案を提示。登録企業の採用ページ情報を自動反映し、AIが使いがちな定番フレーズも検出します。
              </p>

              <div className="mb-8 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[var(--lp-cta)] px-7 py-3.5 text-sm text-white shadow-lg shadow-blue-900/10 transition-all hover:shadow-xl hover:shadow-blue-900/15 active:scale-[0.98]"
                  style={{ fontWeight: 600 }}
                >
                  無料で試す
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-xl border border-slate-200 px-7 py-3.5 text-sm text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                  style={{ fontWeight: 500 }}
                >
                  料金プランを見る
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                {HERO_CHECKS.map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <circle cx="7" cy="7" r="6" stroke="#22c55e" strokeWidth="1.5" />
                      <path d="M4.5 7l1.5 1.5 3-3" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t}
                  </span>
                ))}
              </div>
            </LandingSectionMotion>
          </div>

          <LandingSectionMotion className="w-full lg:w-[52%]">
            <div className="relative">
              <div
                className="absolute -inset-6 -z-10 rounded-3xl blur-2xl"
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom right, color-mix(in srgb, var(--lp-tint-navy-soft) 85%, white), rgba(255,255,255,0.75), transparent)",
                }}
              />
              <div
                className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white p-5 shadow-[0_20px_80px_rgba(10,15,92,0.08)] md:p-7"
                aria-hidden
              >
                {/* Top bar */}
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <span
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--lp-badge-bg)] px-3 py-1 text-xs text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-navy)]" />
                    ES添削
                  </span>
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-[#ecfdf5] text-[#059669]" style={{ fontWeight: 600 }}>
                    <Check className="mr-1 inline-block h-3 w-3" strokeWidth={2.5} />
                    添削完了
                  </span>
                </div>

                {/* Progress chips */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    { label: "改善案", done: true },
                    { label: "出典整理", done: true },
                    { label: "添削完了", done: true },
                  ].map((chip) => (
                    <span
                      key={chip.label}
                      className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[11px] text-[#059669]"
                      style={{ fontWeight: 600 }}
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                        <circle cx="5" cy="5" r="5" fill="#059669" />
                        <path d="M3 5l1.5 1.5 2.5-2.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {chip.label}
                    </span>
                  ))}
                </div>

                {/* Two-column editor + review */}
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
                  {/* Left: Editor area (55%) */}
                  <div className="sm:w-[55%]">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs text-slate-500" style={{ fontWeight: 600 }}>設問: ガクチカ</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400" style={{ fontWeight: 500 }}>400字</span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                      <p className="text-xs text-slate-600" style={{ lineHeight: 1.7 }}>
                        大学3年の春、20人規模の学生団体で広報を担当していました。広報誌の読者数が前年比で30%減少していたため、読者アンケートを実施し...
                      </p>
                    </div>
                    <p className="mt-2 text-right text-[10px] text-slate-300">185 / 400字</p>
                  </div>

                  {/* Right: Review result (45%) */}
                  <div className="sm:w-[45%]">
                    <p className="mb-3 text-xs text-slate-500" style={{ fontWeight: 600 }}>改善した回答</p>
                    <div className="rounded-xl border border-[#d1fae5] bg-[rgba(236,253,245,0.3)] p-4">
                      <p className="text-xs text-slate-700" style={{ lineHeight: 1.7 }}>
                        大学3年の春に20人の学生団体で広報責任者を務め、読者数30%減という課題に直面しました。原因を特定するために読者アンケートを設計・実施し...
                      </p>
                    </div>
                    <p className="mt-2 text-right text-[10px] text-slate-300">192 / 400字</p>

                    {/* Source links */}
                    <div className="mt-3">
                      <p className="mb-2 text-[10px] text-slate-400" style={{ fontWeight: 600 }}>出典リンク</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-1.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          <span className="text-[10px] text-slate-500">企業HP: 事業説明</span>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-1.5">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          <span className="text-[10px] text-slate-500">採用情報: 求める人物像</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="rounded-full bg-[var(--lp-tint-navy-soft)] px-3 py-1 text-[11px] text-[var(--lp-navy)]" style={{ fontWeight: 600 }}>
                    8 クレジット
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-lg border border-slate-200 px-3.5 py-2 text-[11px] text-slate-500" style={{ fontWeight: 600 }}>
                      改善案をコピー
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--lp-navy)] px-4 py-2 text-[11px] text-white" style={{ fontWeight: 600 }}>
                      この改善案を反映
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
