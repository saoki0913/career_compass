"use client";

import { MOCK_COMPANIES, NAV_ITEMS, LOGO_SRC } from "./mock-data";

/**
 * HomeMock -- marketing mock of the product dashboard.
 * Rendered inside ScaleFit at naturalWidth=1120.
 * Outermost div MUST keep style={{ width: 1120 }} for ScaleFit scaling.
 * All visual styling uses Tailwind design-token classes -- NO hex colors, NO inline fontFamily.
 *
 * Reference components:
 *   DashboardHeader, StatsCard, DashboardPageClient, QuickActions,
 *   ActivationChecklistCard, IncompleteTasksCard
 */

export function HomeMock() {
  return (
    <div style={{ width: 1120 }} className="bg-card font-sans">
      {/* ─── Header (h-16, frosted glass) ─── */}
      <header className="backdrop-blur-xl bg-background/80 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo + Nav */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <img
                  src={LOGO_SRC}
                  alt=""
                  className="w-10 h-10 rounded-md object-cover"
                />
                <span className="font-bold text-lg tracking-tight">
                  就活Pass
                </span>
              </div>
              <nav className="flex items-center">
                {NAV_ITEMS.map((t) => (
                  <span
                    key={t}
                    className={
                      t === "ホーム"
                        ? "px-3 py-2 text-sm font-medium rounded-lg text-foreground"
                        : "px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground"
                    }
                  >
                    {t}
                  </span>
                ))}
              </nav>
            </div>

            {/* Right: Search, Bell, Credits, Avatar */}
            <div className="flex items-center gap-2">
              {/* Search bar */}
              <div className="flex items-center gap-2 px-3 py-1.5 border border-input rounded-lg text-xs text-muted-foreground min-w-[150px]">
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <span>検索...</span>
                <span className="ml-auto text-[9px] px-1 py-0.5 bg-secondary rounded text-muted-foreground">
                  ⌘K
                </span>
              </div>

              {/* Bell icon */}
              <div className="p-2 rounded-lg">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>

              {/* Credit badge */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10">
                <svg
                  className="w-4 h-4 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-semibold text-primary">48</span>
              </div>

              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                田
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Dashboard Content ─── */}
      <main className="mx-auto max-w-7xl px-4 py-8">
        {/* Greeting + Today's Task */}
        <div className="mb-6 flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">
              こんにちは、田中さん
            </h1>
            <p className="mt-1 text-muted-foreground">
              今日も就活を一歩前へ進めましょう
            </p>
          </div>

          {/* Today's Task Card */}
          <div className="w-[360px] shrink-0 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 px-3 py-2">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-primary" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1 text-primary">
                    {/* Star icon */}
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="truncate text-xs font-medium">
                      今日の最重要タスク
                    </span>
                  </div>
                  <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                    一覧
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                    ES提出
                  </span>
                  <span className="truncate text-muted-foreground">
                    {MOCK_COMPANIES[0].name}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                    4月25日まで
                  </span>
                </div>
                <p className="truncate text-sm font-medium leading-snug">
                  エントリーシート提出
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Onboarding Banner ─── */}
        <div className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-accent/5 p-5">
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between">
              <div className="max-w-2xl">
                {/* Pill badge */}
                <div className="mb-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  最初の一歩
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  1社登録して、最初の志望動機をAIで作り始めましょう
                </h2>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-4 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary w-2/3" />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-primary">
                    67%
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  2/3 完了
                </span>
              </div>
            </div>

            {/* Step cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "企業",
                  desc: "締切管理を始める",
                  done: true,
                },
                {
                  label: "志望動機",
                  desc: "AIでたたき台を作る",
                  done: true,
                },
                {
                  label: "保存",
                  desc: "提案精度を上げる",
                  done: false,
                },
              ].map((step) => (
                <div
                  key={step.label}
                  className={
                    step.done
                      ? "rounded-xl border border-border/70 bg-background/60 p-4 text-muted-foreground"
                      : "rounded-xl border border-primary/15 bg-background/90 p-4"
                  }
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <span
                      className={
                        step.done
                          ? "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                          : "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                      }
                    >
                      {step.done ? (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {step.label}
                      </p>
                      <p
                        className={
                          step.done
                            ? "mt-1 text-sm font-medium"
                            : "mt-1 text-sm font-medium text-foreground"
                        }
                      >
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Stats / KPI Row ─── */}
        <div className="mb-8 grid grid-cols-3 gap-6">
          {/* Primary card -- 登録企業 */}
          <div className="group relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-primary via-primary/95 to-primary/85 text-primary-foreground shadow-md shadow-primary/20">
            <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-[0.08]">
              <div className="w-full h-full rounded-full bg-current" />
            </div>
            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium tracking-wide opacity-90">
                    登録企業
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight">5</p>
                  <p className="mt-1.5 text-sm opacity-80">
                    {MOCK_COMPANIES.length}社登録済み
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white/15">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Default card -- ES作成数 */}
          <div className="group relative overflow-hidden rounded-2xl p-6 bg-card border border-border/50 shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-[0.08]">
              <div className="w-full h-full rounded-full bg-current" />
            </div>
            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium tracking-wide text-muted-foreground">
                    ES作成数
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight">8</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    完了 3 / 下書き 5
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-secondary">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Default card -- 今週の締切 */}
          <div className="group relative overflow-hidden rounded-2xl p-6 bg-card border border-border/50 shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 opacity-[0.08]">
              <div className="w-full h-full rounded-full bg-current" />
            </div>
            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium tracking-wide text-muted-foreground">
                    今週の締切
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight">2</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    直近7日間
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-secondary">
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Quick Actions ─── */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">クイックアクション</h2>
          <div className="grid grid-cols-3 gap-4">
            {/* 1: 企業を追加 (indigo) */}
            <div className="group relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-md shadow-indigo-500/25 h-[136px] flex flex-col justify-start items-start">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
                <div className="w-full h-full rounded-full bg-white/10" />
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  企業を追加
                </h3>
                <p className="mt-1 text-sm opacity-85">新しい企業を登録</p>
              </div>
            </div>

            {/* 2: ES作成/添削 (orange) */}
            <div className="group relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-orange-500 to-orange-600 shadow-md shadow-orange-500/25 h-[136px] flex flex-col justify-start items-start">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
                <div className="w-full h-full rounded-full bg-white/10" />
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  ES作成/添削
                </h3>
                <p className="mt-1 text-sm opacity-85">書いて整える</p>
              </div>
            </div>

            {/* 3: 面接対策 (emerald) */}
            <div className="group relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/25 h-[136px] flex flex-col justify-start items-start">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
                <div className="w-full h-full rounded-full bg-white/10" />
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  面接対策
                </h3>
                <p className="mt-1 text-sm opacity-85">企業別に模擬面接</p>
              </div>
            </div>

            {/* 4: ガクチカ作成 (rose) */}
            <div className="group relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-rose-500 to-rose-600 shadow-md shadow-rose-500/25 h-[136px] flex flex-col justify-start items-start">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
                <div className="w-full h-full rounded-full bg-white/10" />
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  ガクチカ作成
                </h3>
                <p className="mt-1 text-sm opacity-85">経験を言語化する</p>
              </div>
            </div>

            {/* 5: AIで志望動機 (sky) */}
            <div className="group relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-sky-500 to-sky-600 shadow-md shadow-sky-500/25 h-[136px] flex flex-col justify-start items-start">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
                <div className="w-full h-full rounded-full bg-white/10" />
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  AIで志望動機
                </h3>
                <p className="mt-1 text-sm opacity-85">志望動機を作成</p>
              </div>
            </div>

            {/* 6: 作業途中 (amber — IncompleteTasksCard quickAction variant) */}
            <div className="group relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-amber-100 to-amber-50 border border-amber-200/50 shadow-md h-[136px] flex flex-col justify-start items-start">
              <div className="absolute top-0 right-0 w-24 h-24 -mr-6 -mt-6">
                <div className="w-full h-full rounded-full bg-amber-800/[0.08]" />
              </div>
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-amber-200/50 flex items-center justify-center mb-3 text-amber-700">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold tracking-tight text-amber-800">
                  作業途中
                </h3>
                <p className="mt-1 text-sm text-amber-700/80">2件のタスク</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
