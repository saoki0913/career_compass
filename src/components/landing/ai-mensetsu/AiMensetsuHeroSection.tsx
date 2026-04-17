"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

const HERO_CHECKS = [
  "カード登録不要",
  "質問フロー中は課金なし",
  "最終講評の成功時のみ 6 クレジット",
] as const;

const TOPIC_ITEMS = [
  { label: "自己紹介", status: "done" as const },
  { label: "志望理由", status: "active" as const },
  { label: "強み・経験", status: "pending" as const },
  { label: "逆質問", status: "pending" as const },
];

export function AiMensetsuHeroSection() {
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
                  Feature · AI 模擬面接
                </span>
              </div>

              <h1
                className="text-[2.5rem] tracking-tight text-[var(--lp-navy)] md:text-[3.25rem] lg:text-[3.5rem]"
                style={{ fontWeight: 800, lineHeight: 1.15 }}
              >
                企業別のAI模擬面接で、
                <br />
                面接対策を1問ずつ。
              </h1>

              <p
                className="mt-6 mb-10 max-w-lg text-base text-slate-500 md:text-lg"
                style={{ lineHeight: 1.8 }}
              >
                登録した会社の事業内容・採用ページ・保存済みの志望動機 / ガクチカ / ES を材料に、AI 面接官が 1 問ずつ質問。終わったら 7 軸で講評し、最弱設問の改善後の回答例まで返します。
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
                className="aspect-[1200/760] overflow-hidden rounded-2xl border border-slate-200/50 bg-white p-6 shadow-[0_20px_80px_rgba(10,15,92,0.08)] md:p-8"
                aria-hidden
              >
                {/* Top bar */}
                <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
                  <span
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--lp-badge-bg)] px-3 py-1 text-xs text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-navy)]" />
                    AI 面接官
                  </span>
                  <div className="hidden gap-3 text-[11px] text-slate-400 sm:flex">
                    <span>面接モード：行動面接</span>
                    <span>厳しさ：標準</span>
                  </div>
                </div>

                {/* Two-column content: Chat + Sidebar */}
                <div className="flex gap-4">
                  {/* Left column: Chat area (60-65%) */}
                  <div className="flex min-w-0 flex-1 flex-col gap-4">
                    {/* AI chat bubble */}
                    <div className="rounded-xl bg-[var(--lp-surface-muted)] p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)] text-xs text-white"
                          style={{ fontWeight: 700 }}
                        >
                          AI
                        </span>
                        <p
                          className="text-sm text-[var(--lp-navy)]"
                          style={{ fontWeight: 500, lineHeight: 1.7 }}
                        >
                          御社の〇〇事業で、どんな価値を出していきたいですか？その背景にある原体験も教えてください。
                        </p>
                      </div>
                    </div>

                    {/* Input placeholder */}
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400">
                      回答を入力...
                    </div>
                  </div>

                  {/* Right column: Sidebar card (35-40%) - hidden on mobile */}
                  <div className="hidden w-[38%] shrink-0 sm:block">
                    <div className="rounded-xl border border-slate-100 bg-white p-4">
                      <p
                        className="mb-3 text-xs text-slate-400"
                        style={{ fontWeight: 600 }}
                      >
                        面接進捗
                      </p>
                      <p
                        className="mb-3 text-[11px] text-slate-500"
                        style={{ lineHeight: 1.6 }}
                      >
                        現在の論点:{" "}
                        <span
                          className="text-[var(--lp-navy)]"
                          style={{ fontWeight: 600 }}
                        >
                          志望理由
                        </span>
                      </p>
                      <ul className="space-y-2.5">
                        {TOPIC_ITEMS.map((item) => (
                          <li key={item.label} className="flex items-center gap-2.5">
                            {item.status === "done" ? (
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--lp-success)]">
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                                  <path d="M2.5 5l1.5 1.5 3-3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            ) : item.status === "active" ? (
                              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                                <span className="absolute inset-0 animate-pulse rounded-full bg-[var(--lp-navy)] opacity-20" />
                                <span className="h-2.5 w-2.5 rounded-full bg-[var(--lp-navy)]" />
                              </span>
                            ) : (
                              <span className="h-4 w-4 shrink-0 rounded-full border border-slate-200 bg-white" />
                            )}
                            <span
                              className="text-xs"
                              style={{
                                fontWeight: item.status === "active" ? 600 : 400,
                                color:
                                  item.status === "done"
                                    ? "#64748d"
                                    : item.status === "active"
                                      ? "#000666"
                                      : "#94a3b8",
                              }}
                            >
                              {item.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Bottom bar: Phase badges */}
                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                  <span
                    className="rounded-full bg-[var(--lp-tint-navy-soft)] px-3 py-1 text-[11px] text-[var(--lp-navy)]"
                    style={{ fontWeight: 600 }}
                  >
                    本編
                  </span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-500"
                    style={{ fontWeight: 500 }}
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lp-navy)]" />
                    深掘り中
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
