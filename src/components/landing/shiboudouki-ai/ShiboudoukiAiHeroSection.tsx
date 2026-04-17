"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

const HERO_CHECKS = [
  "カード登録不要",
  "6〜7 問で ES 解放",
  "成功時のみクレジット消費",
] as const;

const STAGE_ITEMS = [
  { label: "業界理由", status: "completed" as const },
  { label: "企業理由", status: "completed" as const },
  { label: "自分との接続", status: "current" as const },
  { label: "やりたい仕事", status: "pending" as const },
  { label: "価値貢献", status: "pending" as const },
  { label: "差別化", status: "pending" as const },
] as const;

const CHAR_LIMITS = [300, 400, 500] as const;

export function ShiboudoukiAiHeroSection() {
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
                  Feature · 志望動機AI
                </span>
              </div>

              <h1
                className="text-[2.5rem] tracking-tight text-[var(--lp-navy)] md:text-[3.25rem] lg:text-[3.5rem]"
                style={{ fontWeight: 800, lineHeight: 1.15 }}
              >
                志望動機を、AIと会話で
                <br className="hidden sm:inline" />
                整理しながら下書きする。
              </h1>

              <p
                className="mt-6 mb-10 max-w-lg text-base text-slate-500 md:text-lg"
                style={{ lineHeight: 1.8 }}
              >
                業界理由・企業理由・自分との接続・やりたい仕事・価値貢献・差別化の 6 要素を、AI と 1 問ずつ会話で整理。材料が揃えば 300 / 400 / 500 字の ES 下書きを生成できます。
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
                      <path
                        d="M4.5 7l1.5 1.5 3-3"
                        stroke="#22c55e"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
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
                className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white shadow-[0_20px_80px_rgba(10,15,92,0.08)]"
                aria-hidden
              >
                {/* Top bar: title + char limit buttons */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 md:px-6">
                  <span
                    className="text-sm text-[var(--lp-navy)]"
                    style={{ fontWeight: 700 }}
                  >
                    志望動機を作成
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-[11px] text-slate-400" style={{ fontWeight: 500 }}>
                      文字数
                    </span>
                    {CHAR_LIMITS.map((limit) => (
                      <span
                        key={limit}
                        className={
                          limit === 400
                            ? "rounded-lg bg-[var(--lp-navy)] px-2.5 py-1 text-[11px] text-white"
                            : "rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-400"
                        }
                        style={{ fontWeight: 600 }}
                      >
                        {limit}字
                      </span>
                    ))}
                  </div>
                </div>

                {/* Two-column content: chat + sidebar */}
                <div className="flex">
                  {/* Chat column (left) */}
                  <div className="flex-1 border-r border-slate-100 p-4 md:p-5">
                    <div className="space-y-4">
                      {/* AI bubble 1 */}
                      <div className="flex items-start gap-2.5">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)] text-[10px] text-white"
                          style={{ fontWeight: 700 }}
                        >
                          AI
                        </span>
                        <div className="rounded-xl bg-[var(--lp-surface-muted)] p-4">
                          <p
                            className="text-sm text-slate-700"
                            style={{ lineHeight: 1.7 }}
                          >
                            業界を志望する理由を教えてください。
                          </p>
                        </div>
                      </div>

                      {/* User bubble */}
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl bg-[var(--lp-navy)] px-4 py-3">
                          <p
                            className="text-sm text-white"
                            style={{ lineHeight: 1.7 }}
                          >
                            IT業界を志望しているのは、大学で情報系を学ぶ中で...
                          </p>
                        </div>
                      </div>

                      {/* AI bubble 2 */}
                      <div className="flex items-start gap-2.5">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)] text-[10px] text-white"
                          style={{ fontWeight: 700 }}
                        >
                          AI
                        </span>
                        <div className="rounded-xl bg-[var(--lp-surface-muted)] p-4">
                          <p
                            className="text-sm text-slate-700"
                            style={{ lineHeight: 1.7 }}
                          >
                            その中で御社を選ぶ理由は何ですか？
                          </p>
                        </div>
                      </div>

                      {/* Input placeholder */}
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
                        回答を入力...
                      </div>
                    </div>
                  </div>

                  {/* Sidebar column (right) — hidden on mobile */}
                  <div className="hidden w-[38%] p-4 sm:block md:p-5">
                    {/* Sidebar card: stage tracker */}
                    <div className="rounded-xl border border-slate-100 bg-white p-4">
                      <p
                        className="mb-3 text-xs text-slate-400"
                        style={{ fontWeight: 600 }}
                      >
                        ステージ
                      </p>

                      <div className="relative space-y-0">
                        {STAGE_ITEMS.map((item, i) => {
                          const isCompleted = item.status === "completed";
                          const isCurrent = item.status === "current";
                          const isLast = i === STAGE_ITEMS.length - 1;

                          return (
                            <div key={item.label} className="relative flex items-start gap-2.5 pb-3">
                              {/* Vertical connector line */}
                              {!isLast && (
                                <div
                                  className="absolute left-[7px] top-[18px] w-px"
                                  style={{
                                    height: "calc(100% - 6px)",
                                    backgroundColor: isCompleted ? "#34d399" : "#e2e8f0",
                                  }}
                                />
                              )}

                              {/* Status icon */}
                              <div className="relative z-10 mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center">
                                {isCompleted && (
                                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
                                    <circle cx="7.5" cy="7.5" r="7.5" fill="#34d399" />
                                    <path
                                      d="M4.5 7.5l2 2 4-4"
                                      stroke="#fff"
                                      strokeWidth="1.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                                {isCurrent && (
                                  <span className="flex h-[15px] w-[15px] items-center justify-center">
                                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#38bdf8]" />
                                  </span>
                                )}
                                {item.status === "pending" && (
                                  <span className="h-[15px] w-[15px] rounded-full border-2 border-slate-200 bg-white" />
                                )}
                              </div>

                              {/* Label + badge */}
                              <div className="flex flex-1 items-center justify-between gap-1">
                                <span
                                  className="text-xs text-slate-600"
                                  style={{
                                    fontWeight: isCurrent ? 600 : 500,
                                    color: isCurrent ? "var(--lp-navy)" : undefined,
                                  }}
                                >
                                  {item.label}
                                </span>
                                {isCompleted && (
                                  <span
                                    className="rounded-full bg-[#ecfdf5] px-2.5 py-0.5 text-[11px] text-[#047857]"
                                    style={{ fontWeight: 600 }}
                                  >
                                    完了
                                  </span>
                                )}
                                {isCurrent && (
                                  <span
                                    className="rounded-full bg-[#f0f9ff] px-2.5 py-0.5 text-[11px] text-[#0369a1]"
                                    style={{ fontWeight: 600 }}
                                  >
                                    進行中
                                  </span>
                                )}
                                {item.status === "pending" && (
                                  <span
                                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-400"
                                    style={{ fontWeight: 600 }}
                                  >
                                    未着手
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <p className="mt-1 text-[11px] text-slate-400">
                        3 / 6 項目
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom bar: phase badge */}
                <div className="border-t border-slate-100 px-5 py-3 md:px-6">
                  <span
                    className="rounded-full bg-[var(--lp-tint-navy-soft)] px-2.5 py-0.5 text-[11px] text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    材料整理中
                  </span>
                </div>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
