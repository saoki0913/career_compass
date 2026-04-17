"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingSectionMotion } from "../LandingSectionMotion";

const HERO_CHECKS = [
  "カード登録不要",
  "4〜6 問で ES 解放",
  "成功時のみクレジット消費",
] as const;

const PHASES = [
  { key: "ES 材料", label: "ES 材料回収", active: true },
  { key: "ES 作成可", label: "ES 作成可", active: false },
  { key: "面接深掘り", label: "面接向け深掘り", active: false },
  { key: "面接準備完了", label: "面接準備完了", active: false },
] as const;

const STAR_ELEMENTS: readonly {
  key: string;
  label: string;
  done: boolean;
  active: boolean;
  snippet: string;
}[] = [
  { key: "状況", label: "状況", done: true, active: false, snippet: "大学3年の春、20人の学生団体で広報を担当" },
  { key: "課題", label: "課題", done: true, active: false, snippet: "広報誌の読者数が前年比30%減少" },
  { key: "行動", label: "行動", done: false, active: true, snippet: "整理中..." },
  { key: "結果", label: "結果", done: false, active: false, snippet: "\u2014" },
];

export function GakuchikaAiHeroSection() {
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
          {/* Left column: copy + CTA */}
          <div className="shrink-0 lg:w-[48%]">
            <LandingSectionMotion instant>
              <div className="mb-7">
                <span className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--lp-navy)]" />
                  Feature · ガクチカAI
                </span>
              </div>

              <h1
                className="text-[2.5rem] tracking-tight text-[var(--lp-navy)] md:text-[3.25rem] lg:text-[3.5rem]"
                style={{ fontWeight: 800, lineHeight: 1.15 }}
              >
                ガクチカを、ES用と面接用の
                <br className="hidden sm:inline" />
                両方でまとめて深掘りする。
              </h1>

              <p
                className="mt-6 mb-10 max-w-lg text-base text-slate-500 md:text-lg"
                style={{ lineHeight: 1.8 }}
              >
                短い初期入力からまず ES に載せられる水準の本文を作り、その後に同じ会話の続きとして面接向けの深掘りへ。4 フェーズで段階的に進め、面接準備パックまで提示します。
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

          {/* Right column: chat preview + STAR mock */}
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
                <div className="p-6 md:p-8">
                  {/* Header */}
                  <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
                    <span
                      className="text-sm text-[var(--lp-navy)]"
                      style={{ fontWeight: 700 }}
                    >
                      ガクチカ 4 フェーズ
                    </span>
                    <span
                      className="rounded-full bg-[var(--lp-tint-navy-soft)] px-2.5 py-0.5 text-[11px] text-[var(--lp-navy)]"
                      style={{ fontWeight: 600 }}
                    >
                      ES 材料フェーズ
                    </span>
                  </div>

                  {/* Two-column: Chat preview (left) + STAR grid (right) */}
                  <div className="flex flex-col gap-5 md:flex-row">
                    {/* Chat preview -- hidden on mobile */}
                    <div className="hidden md:block md:w-[57%]">
                      <p
                        className="mb-3 text-[11px] text-slate-400"
                        style={{ fontWeight: 600 }}
                      >
                        会話プレビュー
                      </p>
                      <div className="space-y-3">
                        {/* AI bubble */}
                        <div className="flex gap-2.5">
                          <span
                            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
                            style={{ backgroundColor: "var(--lp-navy)", fontWeight: 700 }}
                          >
                            AI
                          </span>
                          <div
                            className="rounded-xl p-3.5"
                            style={{ backgroundColor: "var(--lp-surface-muted)" }}
                          >
                            <p
                              className="text-xs"
                              style={{ lineHeight: 1.7, color: "#334155" }}
                            >
                              取り組みの中で、あなたが直面した課題は何ですか？
                            </p>
                          </div>
                        </div>

                        {/* User bubble */}
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl bg-[var(--lp-navy)] px-4 py-3">
                            <p
                              className="text-xs text-white"
                              style={{ lineHeight: 1.7 }}
                            >
                              広報誌の読者数が減少しており...
                            </p>
                          </div>
                        </div>

                        {/* Input placeholder */}
                        <div
                          className="rounded-lg border border-dashed px-4 py-2.5 text-sm"
                          style={{ borderColor: "#e2e8f0", backgroundColor: "var(--lp-surface-muted)", color: "#94a3b8" }}
                        >
                          回答を入力...
                        </div>
                      </div>
                    </div>

                    {/* STAR 2x2 grid */}
                    <div className="w-full md:w-[43%]">
                      <p
                        className="mb-3 text-[11px] text-slate-400"
                        style={{ fontWeight: 600 }}
                      >
                        STAR 要素
                      </p>

                      {/* STAR compact progress bar */}
                      <div className="mb-3 flex items-center gap-1">
                        {[
                          { letter: "S", color: "bg-[#10b981]" },
                          { letter: "T", color: "bg-[#10b981]" },
                          { letter: "A", color: "bg-[#0ea5e9]" },
                          { letter: "R", color: "bg-slate-200" },
                        ].map((bar) => (
                          <div key={bar.letter} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-[9px] text-slate-400" style={{ fontWeight: 600 }}>{bar.letter}</span>
                            <div className={`h-1.5 w-full rounded-full ${bar.color}`} />
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {STAR_ELEMENTS.map((el) => (
                          <div
                            key={el.key}
                            className="rounded-lg border p-2.5"
                            style={{
                              borderColor: el.active
                                ? "var(--lp-navy)"
                                : el.done
                                  ? "var(--lp-success)"
                                  : "#e2e8f0",
                              backgroundColor: el.active
                                ? "rgba(0,6,102,0.03)"
                                : "white",
                            }}
                          >
                            <div className="flex items-center gap-2">
                              {el.done ? (
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--lp-success)]">
                                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                                </span>
                              ) : el.active ? (
                                <span
                                  className="h-4 w-4 shrink-0 rounded-full border-2"
                                  style={{
                                    borderColor: "var(--lp-navy)",
                                    animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                                  }}
                                />
                              ) : (
                                <span className="h-4 w-4 shrink-0 rounded-full border bg-white" style={{ borderColor: "#e2e8f0" }} />
                              )}
                              <span
                                className="text-xs"
                                style={{
                                  fontWeight: 600,
                                  color: el.done
                                    ? "var(--lp-success)"
                                    : el.active
                                      ? "var(--lp-navy)"
                                      : "#94a3b8",
                                }}
                              >
                                {el.label}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-[10px]" style={{ color: "#94a3b8" }}>
                              {el.snippet}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="mt-5 mb-5 border-t border-slate-100" />

                  {/* ES作成可 badge */}
                  <div className="mb-4">
                    <span className="inline-flex items-center rounded-full border border-[#fde68a] bg-[#fffbeb] px-2.5 py-0.5 text-[11px] text-[#b45309]" style={{ fontWeight: 600 }}>
                      ES作成可
                    </span>
                  </div>

                  {/* Phase tracker: vertical dots + connector */}
                  <div className="relative mb-4 pl-5">
                    {/* Vertical connector line */}
                    <div
                      className="absolute left-[7px] top-[6px] w-px"
                      style={{
                        height: "calc(100% - 12px)",
                        backgroundColor: "#e5edf5",
                      }}
                    />

                    <div className="space-y-3">
                      {PHASES.map((phase) => (
                        <div key={phase.key} className="relative flex items-center gap-3">
                          {/* Dot */}
                          <span
                            className="absolute -left-5 flex h-3.5 w-3.5 items-center justify-center rounded-full"
                            style={
                              phase.active
                                ? { backgroundColor: "var(--lp-navy)" }
                                : { border: "1.5px solid #cbd5e1", backgroundColor: "white" }
                            }
                          >
                            {phase.active && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span
                            className="text-xs"
                            style={{
                              fontWeight: phase.active ? 700 : 400,
                              color: phase.active ? "var(--lp-navy)" : "#94a3b8",
                            }}
                          >
                            {phase.key}
                          </span>
                          <span
                            className="text-xs"
                            style={{
                              color: phase.active ? "var(--lp-navy)" : "#94a3b8",
                              fontWeight: phase.active ? 600 : 400,
                            }}
                          >
                            {phase.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress label */}
                  <p className="text-xs text-slate-400" style={{ fontWeight: 500 }}>
                    行動を整理中
                  </p>
                </div>
              </div>
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
